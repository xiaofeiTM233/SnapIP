// app/api/ips/batch/route.ts
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import IpEntry from '@/models/IpEntry';
import { Address4, Address6 } from 'ip-address';

// 检测IP版本并创建相应的Address对象
function parseAddress(cidr: string): Address4 | Address6 | null {
  try {
    return new Address4(cidr);
  } catch (e) {
    try {
      return new Address6(cidr);
    } catch (e2) {
      return null;
    }
  }
}

export async function POST(request: Request) {
  await dbConnect();
  const body = await request.json();
  const { items } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ success: false, message: '缺少导入数据' }, { status: 400 });
  }

  // 获取所有现有数据用于冲突检测
  const allEntries = await IpEntry.find({});
  const results: any[] = [];
  const toInsert: any[] = [];
  const toDelete: string[] = [];

  for (const item of items) {
    const { cidr, label, note, original, overwrite } = item;

    if (!cidr || !label) {
      results.push({
        original: original || cidr,
        cidr,
        status: 'error',
        error: '缺少 CIDR 或 标签',
      });
      continue;
    }

    // 验证 CIDR 格式
    const newIp = parseAddress(cidr);
    if (!newIp) {
      results.push({
        original: original || cidr,
        cidr,
        status: 'error',
        error: '无效的 IP 段格式',
      });
      continue;
    }

    // 查重逻辑
    const conflictedEntries: any[] = [];
    const containingEntries: any[] = [];

    for (const entry of allEntries) {
      try {
        const existingIp = parseAddress(entry.cidr);
        if (!existingIp) continue;

        // 新IP被现有的大IP段包含
        if (newIp.isInSubnet(existingIp)) {
          containingEntries.push(entry);
        }

        // 新IP包含现有的小IP段
        if (existingIp.isInSubnet(newIp)) {
          conflictedEntries.push(entry);
        }
      } catch (e) {
        continue;
      }
    }

    // 检查是否完全重复
    const exactDuplicate = allEntries.find(entry => {
      try {
        const existingIp = parseAddress(entry.cidr);
        if (!existingIp) return false;
        const sameCidr = existingIp.startAddress().address === newIp.startAddress().address &&
                        existingIp.endAddress().address === newIp.endAddress().address;
        const sameLabel = entry.label === label;
        return sameCidr && sameLabel;
      } catch (e) {
        return false;
      }
    });

    if (exactDuplicate) {
      results.push({
        original: original || cidr,
        cidr,
        status: 'skipped',
        error: '重复',
      });
      continue;
    }

    // 被包含的情况
    if (containingEntries.length > 0) {
      results.push({
        original: original || cidr,
        cidr,
        status: 'skipped',
        error: '重复',
        containingEntries: containingEntries.map(e => ({
          id: e._id,
          cidr: e.cidr,
          label: e.label,
          note: e.note
        }))
      });
      continue;
    }

    // 冲突的情况
    if (conflictedEntries.length > 0) {
      if (overwrite) {
        // 标记需要删除的小IP段和需要插入的新IP段
        toDelete.push(...conflictedEntries.map(e => e._id.toString()));
        toInsert.push({ cidr, label, note });
        // 从 allEntries 中移除被覆盖的条目，避免影响后续检测
        for (const entry of conflictedEntries) {
          const idx = allEntries.findIndex(e => e._id.toString() === entry._id.toString());
          if (idx !== -1) allEntries.splice(idx, 1);
        }
        // 添加新条目到 allEntries，避免影响后续检测
        allEntries.push({ cidr, label, note } as any);
        results.push({
          original: original || cidr,
          cidr,
          status: 'success',
          error: null,
        });
      } else {
        results.push({
          original: original || cidr,
          cidr,
          status: 'conflict',
          error: '冲突',
          conflictedEntries: conflictedEntries.map(e => ({
            id: e._id,
            cidr: e.cidr,
            label: e.label,
            note: e.note
          }))
        });
      }
      continue;
    }

    // 无冲突，标记为待插入
    toInsert.push({ cidr, label, note });
    // 添加新条目到 allEntries，避免影响后续检测
    allEntries.push({ cidr, label, note } as any);
    results.push({
      original: original || cidr,
      cidr,
      status: 'success',
      error: null,
    });
  }

  // 批量执行数据库操作
  try {
    if (toDelete.length > 0) {
      await IpEntry.deleteMany({ _id: { $in: toDelete } });
    }
    if (toInsert.length > 0) {
      await IpEntry.insertMany(toInsert);
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, results });
}
