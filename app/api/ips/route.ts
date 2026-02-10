// app/api/ips/route.ts
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import IpEntry from '@/models/IpEntry';
import { Address4, Address6 } from 'ip-address';

// 检测IP版本并创建相应的Address对象
function parseAddress(cidr: string): Address4 | Address6 | null {
  // 尝试解析为IPv4
  try {
    return new Address4(cidr);
  } catch (e) {
    // 失败则尝试IPv6
    try {
      return new Address6(cidr);
    } catch (e2) {
      return null;
    }
  }
}

export async function GET(request: Request) {
  await dbConnect();
  const { searchParams } = new URL(request.url);
  const label = searchParams.get('label');
  const ip = searchParams.get('ip');

  // 如果提供了IP参数，查询包含该IP的所有网段或前缀匹配的网段
  if (ip) {
    try {
      const allEntries = await IpEntry.find({}).sort({ createdAt: -1 });
      const queryText = ip.trim().toLowerCase();

      // 尝试作为完整IP地址查询（包含关系）
      const queryIp = parseAddress(ip);

      const matchedEntries = allEntries.filter(entry => {
        try {
          const entryCidr = entry.cidr.toLowerCase();

          // 1. 前缀匹配：检查网段CIDR是否以查询文本开头
          if (entryCidr.startsWith(queryText)) {
            return true;
          }

          // 2. 如果查询的IP可以被解析，检查是否在该网段内
          if (queryIp) {
            const entryIp = parseAddress(entry.cidr);
            if (entryIp) {
              return queryIp.isInSubnet(entryIp);
            }
          }

          return false;
        } catch (e) {
          return false;
        }
      });
      return NextResponse.json({ success: true, data: matchedEntries });
    } catch (e) {
      return NextResponse.json({ success: false, message: '查询失败' }, { status: 500 });
    }
  }

  // 否则按标签查询或查询全部
  const query = label ? { label } : {};
  const ips = await IpEntry.find(query).sort({ createdAt: -1 });

  return NextResponse.json({ success: true, data: ips });
}

export async function POST(request: Request) {
  await dbConnect();
  const body = await request.json();
  const { cidr, label, note, overwrite, _checkOnly } = body;

  if (!cidr || !label) {
    return NextResponse.json({ success: false, message: '缺少 CIDR 或 标签' }, { status: 400 });
  }

  // 1. 验证 CIDR 格式（支持IPv4和IPv6）
  const newIp = parseAddress(cidr);
  if (!newIp) {
    return NextResponse.json({ success: false, message: '无效的 IP 段格式（仅支持IPv4和IPv6）' }, { status: 400 });
  }

  // 2. 查重逻辑 (取出所有数据进行比对)
  const allEntries = await IpEntry.find({});

  // 收集被包含的小IP段（用于覆盖）
  const conflictedEntries: any[] = [];
  // 收集包含新IP的大IP段
  const containingEntries: any[] = [];

  for (const entry of allEntries) {
    try {
      const existingIp = parseAddress(entry.cidr);
      if (!existingIp) continue; // 跳过无法解析的条目

      // 场景 1: 新加入的 (110.249.1.0/24) 已经被现有的 (110.249.0.0/16) 包含
      if (newIp.isInSubnet(existingIp)) {
        containingEntries.push(entry);
      }

      // 场景 2: 新加入的 (110.249.0.0/16) 包含了现有的 (110.249.1.0/24)
      if (existingIp.isInSubnet(newIp)) {
        conflictedEntries.push(entry);
      }

    } catch (e) {
      continue; // 忽略脏数据
    }
  }

  // 如果新IP被现有的大IP段包含
  if (containingEntries.length > 0) {
    // 如果是检查模式，只返回包含信息
    if (_checkOnly === true) {
      return NextResponse.json({
        success: false,
        conflictType: 'contained',
        message: `该 IP 段已被以下 ${containingEntries.length} 个网段包含：`,
        containingEntries: containingEntries.map(e => ({
          id: e._id,
          cidr: e.cidr,
          label: e.label,
          note: e.note
        }))
      }, { status: 200 });
    }

    return NextResponse.json({
      success: false,
      conflictType: 'contained',
      message: `该 IP 段已被以下 ${containingEntries.length} 个网段包含：`,
      containingEntries: containingEntries.map(e => ({
        id: e._id,
        cidr: e.cidr,
        label: e.label,
        note: e.note
      }))
    }, { status: 409 });
  }

  // 如果存在会被包含的小IP段
  if (conflictedEntries.length > 0) {
    // 如果是检查模式，只返回冲突信息
    if (_checkOnly === true) {
      return NextResponse.json({
        success: false,
        conflictType: 'contains_existing',
        message: `该 IP 段将覆盖以下 ${conflictedEntries.length} 个已存在的网段：`,
        conflictedEntries: conflictedEntries.map(e => ({
          id: e._id,
          cidr: e.cidr,
          label: e.label,
          note: e.note
        }))
      }, { status: 200 });
    }

    // 如果明确要求覆盖，则删除小IP段并保存大的
    if (overwrite === true) {
      // 删除所有被包含的小IP段
      await IpEntry.deleteMany({ _id: { $in: conflictedEntries.map(e => e._id) } });
      // 保存新的大IP段
      const newEntry = await IpEntry.create({ cidr, label, note });
      return NextResponse.json({ success: true, data: newEntry });
    }

    // 否则返回冲突信息，让前端确认
    return NextResponse.json({
      success: false,
      conflictType: 'contains_existing',
      message: `该 IP 段将覆盖以下 ${conflictedEntries.length} 个已存在的网段：`,
      conflictedEntries: conflictedEntries.map(e => ({
        id: e._id,
        cidr: e.cidr,
        label: e.label,
        note: e.note
      }))
    }, { status: 409 });
  }

  // 3. 无冲突，保存
  try {
    // 检查是否完全重复（包括label）
    const exactDuplicate = allEntries.find(entry => {
      try {
        const existingIp = parseAddress(entry.cidr);
        if (!existingIp) return false;
        // 检查CIDR是否相同
        const sameCidr = existingIp.startAddress().address === newIp.startAddress().address &&
                        existingIp.endAddress().address === newIp.endAddress().address;
        // 检查label是否相同
        const sameLabel = entry.label === label;
        return sameCidr && sameLabel;
      } catch (e) {
        return false;
      }
    });

    if (exactDuplicate) {
      // 完全重复，返回duplicate类型
      if (_checkOnly === true) {
        return NextResponse.json({
          success: false,
          conflictType: 'duplicate',
          message: '该 IP 段已完全重复存在'
        }, { status: 200 });
      }
      return NextResponse.json({ success: false, message: '该 IP 段已完全重复存在' }, { status: 409 });
    }

    // 如果是检查模式，只返回成功信息
    if (_checkOnly === true) {
      return NextResponse.json({
        success: true,
        conflictType: null,
        message: '检查通过'
      }, { status: 200 });
    }

    const newEntry = await IpEntry.create({ cidr, label, note });
    return NextResponse.json({ success: true, data: newEntry });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: '该 IP 段已完全重复存在' }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    await IpEntry.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
}
