// app/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { Layout, Table, Input, Button, Form, Tag, Select, message, Card, Modal, Space, Alert } from 'antd';
import { SearchOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';

const { Header, Content } = Layout;
const { TextArea } = Input;

interface IpData {
  _id: string;
  cidr: string;
  label: string;
  note: string;
  createdAt: string;
}

interface ConflictedEntry {
  id: string;
  cidr: string;
  label: string;
  note: string;
}

export default function Home() {
  const [data, setData] = useState<IpData[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [filterLabel, setFilterLabel] = useState<string>('');
  const [filterIp, setFilterIp] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [conflictedEntries, setConflictedEntries] = useState<ConflictedEntry[]>([]);
  const [containingEntries, setContainingEntries] = useState<ConflictedEntry[]>([]);
  const [pendingSubmitData, setPendingSubmitData] = useState<any>(null);
  const [labelOptions, setLabelOptions] = useState<string[]>(['A', 'B', 'C']); // 存储所有可用的组
  const [selectedLabel, setSelectedLabel] = useState<string>('A'); // 当前选择的组
  const [batchImportModalOpen, setBatchImportModalOpen] = useState(false); // 批量导入模态框
  const [batchImportText, setBatchImportText] = useState<string>(''); // 批量导入文本
  const [batchImportLabel, setBatchImportLabel] = useState<string>('A'); // 批量导入的组
  const [batchImportNote, setBatchImportNote] = useState<string>(''); // 批量导入的备注
  const [batchImportResults, setBatchImportResults] = useState<any[]>([]); // 批量导入结果
  const [exportFormat, setExportFormat] = useState<'line' | 'csv'>('line'); // 导出格式：line(一行一个) 或 csv(逗号分隔)

  // 获取数据
  const fetchIps = async (label = '', ip = '') => {
    setLoading(true);
    try {
      let url = '/api/ips';
      const params = new URLSearchParams();
      if (label && label !== 'All') params.append('label', label);
      if (ip) params.append('ip', ip);
      if (params.toString()) url += '?' + params.toString();
      
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        // 只在无过滤条件时更新组选项，避免过滤查询时丢失其他组
        if (!label && !ip) {
          const labels = [...new Set(json.data.map((item: IpData) => item.label))] as string[];
          setLabelOptions(labels);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // 从localStorage加载保存的数据
  useEffect(() => {
    const savedLabels = localStorage.getItem('labelOptions');
    const savedSelectedLabel = localStorage.getItem('selectedLabel');
    
    if (savedLabels) {
      setLabelOptions(JSON.parse(savedLabels));
    }
    
    if (savedSelectedLabel) {
      setSelectedLabel(savedSelectedLabel);
    }

    setMounted(true);
    fetchIps();
  }, []);

  // 保存到localStorage
  const saveToLocalStorage = (options: string[], selected: string) => {
    localStorage.setItem('labelOptions', JSON.stringify(options));
    localStorage.setItem('selectedLabel', selected);
  };

  // 当labelOptions或selectedLabel变化时保存
  useEffect(() => {
    if (mounted) {
      saveToLocalStorage(labelOptions, selectedLabel);
    }
  }, [labelOptions, selectedLabel, mounted]);

  // 初始化表单默认值
  useEffect(() => {
    if (mounted) {
      form.setFieldsValue({ label: [selectedLabel] }); // mode="tags" 需要数组格式
    }
  }, [mounted, form, selectedLabel]);

  // 提交数据
  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // 获取label值，可能是数组也可能是字符串
      const labelValue = Array.isArray(values.label) ? values.label[0] : values.label;
      
      // 如果是新组，添加到选项列表
      if (!labelOptions.includes(labelValue)) {
        const newOptions = [...labelOptions, labelValue];
        setLabelOptions(newOptions);
      }
      
      // 更新当前选择的组
      setSelectedLabel(labelValue);
      
      const res = await fetch('/api/ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, label: labelValue }),
      });
      const json = await res.json();

      if (res.status === 200 && json.success) {
        message.success('IP 段添加成功');
        form.setFieldsValue({ label: [labelValue] }); // 保持当前选择的组，使用数组格式
        form.setFieldsValue({ cidr: '' }); // 只清空cidr，保留label和note供下一次使用
        fetchIps(filterLabel, filterIp); // 刷新列表
      } else       if (res.status === 409) {
        if (json.conflictType === 'contains_existing') {
          // 显示覆盖确认对话框（新IP包含小网段）
          setConflictedEntries(json.conflictedEntries);
          setPendingSubmitData({ ...values, label: labelValue });
        } else if (json.conflictType === 'contained') {
          // 显示包含确认对话框（新IP被大网段包含）
          setContainingEntries(json.containingEntries);
          setPendingSubmitData({ ...values, label: labelValue });
        } else {
          // 其他冲突直接显示错误
          Modal.error({
            title: 'IP 段冲突',
            content: json.message,
          });
        }
      } else {
        message.error(json.message || '添加失败');
      }
    } catch (error) {
      message.error('网络请求错误');
    } finally {
      setLoading(false);
    }
  };

  // 确认覆盖
  const handleConfirmOverwrite = async () => {
    if (!pendingSubmitData) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingSubmitData, overwrite: true }),
      });
      const json = await res.json();

      if (res.status === 200 && json.success) {
        message.success('IP 段添加成功（已覆盖' + conflictedEntries.length + '个小网段）');
        form.setFieldsValue({ label: [pendingSubmitData.label] }); // 使用数组格式
        form.setFieldsValue({ cidr: '' }); // 只清空cidr，保留label和note供下一次使用
        setConflictedEntries([]);
        setPendingSubmitData(null);
        fetchIps(filterLabel, filterIp);
      } else {
        message.error(json.message || '添加失败');
      }
    } catch (error) {
      message.error('网络请求错误');
    } finally {
      setLoading(false);
    }
  };

  // 取消覆盖
  const handleCancelOverwrite = () => {
    setConflictedEntries([]);
    setContainingEntries([]);
    setPendingSubmitData(null);
  };

  // IP 自动补全函数（提取为独立函数以便复用）
  const autoCompleteCidr = (value: string): string | null => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    // 如果已经是完整的CIDR格式（包含斜杠），不做处理
    if (trimmedValue.includes('/')) return trimmedValue;

    // 检测是否为IPv6（包含冒号）
    const isIPv6 = trimmedValue.includes(':');

    if (isIPv6) {
      // IPv6 自动补全逻辑
      // IPv6常见格式：2001:db8::/32, 2001:db8:8544::/64
      // 如果包含::，直接添加/64
      if (trimmedValue.includes('::')) {
        return `${trimmedValue}/64`;
      }
      // 检测段数（按:分割）
      const hextets = trimmedValue.split(':');
      const hextetsCount = hextets.filter(h => h !== '').length; // 过滤掉空段

      // 根据段数补全，类似于IPv4
      // 2段 → /32 (16位 × 2 = 32位)
      // 3段 → /48 (16位 × 3 = 48位)
      // 4段 → /64 (16位 × 4 = 64位)
      if (hextetsCount === 2) {
        return `${trimmedValue}::/32`;
      } else if (hextetsCount === 3) {
        return `${trimmedValue}::/48`;
      } else if (hextetsCount >= 4) {
        return `${trimmedValue}::/64`;
      }
      return `${trimmedValue}::/64`;
    }

    // IPv4 自动补全逻辑
    // 检查IP格式并补全
    const parts = trimmedValue.split('.');
    
    // 验证每部分是否为数字且在0-255范围内
    const isValidPart = (part: string) => {
      const num = parseInt(part, 10);
      return !isNaN(num) && num >= 0 && num <= 255;
    };

    // 2段：补全为 /16
    if (parts.length === 2 && parts.every(isValidPart)) {
      return `${trimmedValue}.0.0/16`;
    }
    // 3段：补全为 /24
    if (parts.length === 3 && parts.every(isValidPart)) {
      return `${trimmedValue}.0/24`;
    }
    // 4段且没有斜杠：补全为 /32
    if (parts.length === 4 && parts.every(isValidPart)) {
      return `${trimmedValue}/32`;
    }

    return null;
  };

  // IP 自动补全
  const handleCidrBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (!value) return;

    const completed = autoCompleteCidr(value);
    if (completed && completed !== value) {
      form.setFieldValue('cidr', completed);
      message.success(`已自动补全为: ${completed}`);
    }
  };

  // 删除数据
  const handleDelete = async (id: string) => {
    await fetch(`/api/ips?id=${id}`, { method: 'DELETE' });
    message.success('已删除');
    fetchIps(filterLabel, filterIp);
  };

  // 导出数据
  const handleExport = () => {
    if (data.length === 0) {
      message.warning('当前没有数据可导出');
      return;
    }

    // 对数据进行排序：按CIDR字符串排序
    const sortedData = [...data].sort((a, b) => a.cidr.localeCompare(b.cidr));

    let content = '';

    if (exportFormat === 'line') {
      // 一行一个格式，只导出IP段
      content = sortedData.map(item => item.cidr).join('\n');
    } else {
      // 逗号分隔格式，只导出IP段
      content = sortedData.map(item => item.cidr).join(',');
    }

    // 创建Blob并下载
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    // 生成文件名
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const fileName = exportFormat === 'line'
      ? `ip_export_${dateStr}.txt`
      : `ip_export_${dateStr}.txt`;

    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    message.success(`已导出 ${data.length} 条IP段`);
  };

  // 打开批量导入模态框
  const handleOpenBatchImport = () => {
    setBatchImportText('');
    setBatchImportLabel(selectedLabel);
    setBatchImportNote('');
    setBatchImportResults([]);
    setBatchImportModalOpen(true);
  };

  // 批量导入处理
  const handleBatchImport = async () => {
    if (!batchImportText.trim()) {
      message.warning('请输入要导入的IP段');
      return;
    }

    if (!batchImportLabel) {
      message.warning('请选择分组');
      return;
    }

    setLoading(true);
    // 解析输入的IP段
    const lines = batchImportText.split('\n').filter(line => line.trim());
    const results: any[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // 自动补全CIDR
      const cidr = autoCompleteCidr(trimmedLine);
      if (!cidr) {
        results.push({
          original: trimmedLine,
          cidr: null,
          success: false,
          status: 'error',
          error: '无效的IP格式',
        });
        continue;
      }

        // 预检查冲突
      try {
        const res = await fetch('/api/ips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cidr, label: batchImportLabel, note: batchImportNote, _checkOnly: true }),
        });
        const json = await res.json();

        // 检查返回结果
        if (json.success && json.conflictType === null) {
          // 无冲突，直接导入
          const importRes = await fetch('/api/ips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cidr, label: batchImportLabel, note: batchImportNote }),
          });
          const importJson = await importRes.json();

          if (importRes.status === 200 && importJson.success) {
            results.push({
              original: trimmedLine,
              cidr: cidr,
              success: true,
              status: 'success',
              error: null,
            });
          } else {
            results.push({
              original: trimmedLine,
              cidr: cidr,
              success: false,
              status: 'error',
              error: importJson.message || '添加失败',
            });
          }
        } else if (json.conflictType === 'contains_existing') {
          results.push({
            original: trimmedLine,
            cidr: cidr,
            success: false,
            status: 'conflict',
            error: '冲突',
            conflictedEntries: json.conflictedEntries,
          });
        } else if (json.conflictType === 'contained') {
          // 被包含也归为跳过
          results.push({
            original: trimmedLine,
            cidr: cidr,
            success: false,
            status: 'skipped',
            error: '重复',
            containingEntries: json.containingEntries,
          });
        } else if (json.conflictType === 'duplicate') {
          // 完全相同，归为跳过
          results.push({
            original: trimmedLine,
            cidr: cidr,
            success: false,
            status: 'skipped',
            error: '重复',
          });
        } else {
          // 未知错误
          results.push({
            original: trimmedLine,
            cidr: cidr,
            success: false,
            status: 'error',
            error: json.message || '检查失败',
          });
        }
      } catch (error) {
        results.push({
          original: trimmedLine,
          cidr: cidr,
          success: false,
          status: 'error',
          error: '检查失败',
        });
      }
    }

    setLoading(false);
    setBatchImportResults(results);

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const conflictCount = results.filter(r => r.status === 'conflict').length;
    const containedCount = results.filter(r => r.status === 'contained').length;

    if (errorCount === 0 && conflictCount === 0 && containedCount === 0) {
      message.success(`批量导入成功！成功 ${successCount} 个，跳过 ${skippedCount} 个`);
    } else {
      message.warning(`批量导入部分完成！成功 ${successCount} 个，错误 ${errorCount} 个，跳过 ${skippedCount} 个`);
    }

    // 更新组选项
    if (!labelOptions.includes(batchImportLabel)) {
      const newOptions = [...labelOptions, batchImportLabel];
      setLabelOptions(newOptions);
    }
  };

  // 单个冲突项 - 覆盖
  const handleSingleOverwrite = async (index: number) => {
    const entry = batchImportResults[index];
    if (!entry || entry.status !== 'conflict') return;

    setLoading(true);
    try {
      const res = await fetch('/api/ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cidr: entry.cidr, 
          label: batchImportLabel,
          overwrite: true 
        }),
      });
      const json = await res.json();

      if (res.status === 200 && json.success) {
        // 更新结果列表
        const newResults = [...batchImportResults];
        newResults[index] = {
          ...entry,
          success: true,
          status: 'success',
          error: null,
        };
        setBatchImportResults(newResults);
        message.success('覆盖成功');
      } else {
        const newResults = [...batchImportResults];
        newResults[index] = {
          ...entry,
          status: 'error',
          error: json.message || '覆盖失败',
        };
        setBatchImportResults(newResults);
        message.error(json.message || '覆盖失败');
      }
    } catch (error) {
      const newResults = [...batchImportResults];
      newResults[index] = {
        ...entry,
        status: 'error',
        error: '网络请求错误',
      };
      setBatchImportResults(newResults);
      message.error('网络请求错误');
    } finally {
      setLoading(false);
    }
  };

  // 单个冲突项 - 跳过
  const handleSingleSkip = (index: number) => {
    const newResults = [...batchImportResults];
    newResults[index] = {
      ...newResults[index],
      status: 'skipped',
      error: '已跳过',
    };
    setBatchImportResults(newResults);
  };

  // 表格列定义
  const columns = [
    {
      title: '分组',
      dataIndex: 'label',
      key: 'label',
      width: 100,
      render: (text: string) => <Tag color={text === 'A' ? 'blue' : text === 'B' ? 'green' : 'default'}>{text}</Tag>,
    },
    {
      title: 'IP 网段 (CIDR)',
      dataIndex: 'cidr',
      key: 'cidr',
      render: (text: string) => <b style={{ fontFamily: 'monospace' }}>{text}</b>,
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      width: 200,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: IpData) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDelete(record._id)}
        />
      ),
    },
  ];

  if (!mounted) {
    return null;
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Header style={{ background: '#fff', padding: '0 20px', display: 'flex', alignItems: 'center', boxShadow: '0 2px 8px #f0f1f2' }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>SnapIP</div>
      </Header>

      <Content style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        
        {/* 输入区域 */}
        <Card
          title="添加新网段"
          style={{ marginBottom: 24 }}
          extra={
            <Button
              type="default"
              icon={<UploadOutlined />}
              onClick={handleOpenBatchImport}
            >
              批量导入
            </Button>
          }
        >
          <Form form={form} layout="horizontal" onFinish={onFinish}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <Form.Item
                name="cidr"
                rules={[{ required: true, message: '请输入CIDR' }]}
                style={{ flex: 2, marginBottom: 0 }}
              >
                <Input
                  placeholder="例如: 47.82.123 (IPv4) 或 2001:db8: (IPv6)"
                  allowClear
                  onBlur={handleCidrBlur}
                />
              </Form.Item>
              <Form.Item
                name="label"
                rules={[{ required: true, message: '请选择或输入分组' }]}
                style={{ flex: 1, marginBottom: 0 }}
              >
                <Select
                  placeholder="选择分组"
                  mode="tags"
                  maxTagCount={1}
                  options={labelOptions.map(opt => ({ value: opt, label: opt }))}
                />
              </Form.Item>
              <Form.Item name="note" style={{ flex: 1.5, marginBottom: 0 }}>
                <Input placeholder="备注 (可选)" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={loading}>
                  存入
                </Button>
              </Form.Item>
            </div>
          </Form>
          <Alert
            title="自动补全示例：输入 47.82 → 47.82.0.0/16；输入 2001:db8 → 2001:db8::/32"
            type="info"
            showIcon
            style={{ marginTop: 12 }}
          />
        </Card>

        {/* 列表区域 */}
        <Card title="IP 列表">
          <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <Input 
              placeholder="输入IP地址查询..." 
              prefix={<SearchOutlined />} 
              style={{ width: 200 }}
              value={filterIp}
              onChange={(e) => setFilterIp(e.target.value)}
              onPressEnter={() => fetchIps(filterLabel, filterIp)}
            />
            <Select
              placeholder="选择分组"
              style={{ width: 120 }}
              value={filterLabel || 'All'}
              onChange={(value) => setFilterLabel(value)}
              options={['All', ...labelOptions].map(opt => ({ value: opt, label: opt }))}
            />
            <Button type="primary" onClick={() => fetchIps(filterLabel, filterIp)}>查询</Button>
            <Button icon={<ReloadOutlined />} onClick={() => { setFilterLabel(''); setFilterIp(''); fetchIps(''); }}>重置</Button>
            
            <Space.Compact style={{ borderLeft: '1px solid #e0e0e0', paddingLeft: 10, marginLeft: 10 }}>
              <Select
                value={exportFormat}
                onChange={(value) => setExportFormat(value)}
                size="small"
                style={{ width: 120, marginRight: -1 }}
                options={[
                  { value: 'line', label: '一行一个' },
                  { value: 'csv', label: '逗号分隔' }
                ]}
              />
              <Button type="default" icon={<DownloadOutlined />} onClick={handleExport}>
                导出
              </Button>
            </Space.Compact>
          </div>
          
          <Table
            columns={columns}
            dataSource={data}
            rowKey="_id"
            loading={loading}
            size="small"
            pagination={{ pageSize: 10 }}
          />
        </Card>

      </Content>

      {/* 覆盖确认对话框 */}
      <Modal
        title="确认覆盖"
        open={conflictedEntries.length > 0}
        onOk={handleConfirmOverwrite}
        onCancel={handleCancelOverwrite}
        okText="覆盖"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={600}
      >
        <p style={{ marginBottom: 16 }}>
          新的 IP 段将覆盖以下 <strong>{conflictedEntries.length}</strong> 个已存在的网段：
        </p>
        <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
          {conflictedEntries.map((entry) => (
            <div key={entry.id} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #e0e0e0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag color={entry.label === 'A' ? 'blue' : entry.label === 'B' ? 'green' : 'default'}>
                  {entry.label}
                </Tag>
                <b style={{ fontFamily: 'monospace' }}>{entry.cidr}</b>
              </div>
              {entry.note && <div style={{ fontSize: '12px', color: '#666', marginTop: '4px', marginLeft: '32px' }}>{entry.note}</div>}
            </div>
          ))}
        </div>
        <p style={{ marginTop: 16, color: '#ff4d4f', fontSize: '12px' }}>
          ⚠️ 覆盖后，上述小网段将被删除，无法恢复。
        </p>
      </Modal>

      {/* 被包含确认对话框 */}
      <Modal
        title="IP 段已被包含"
        open={containingEntries.length > 0}
        onOk={handleCancelOverwrite}
        onCancel={handleCancelOverwrite}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <p style={{ marginBottom: 16 }}>
          新的 IP 段已被以下 <strong>{containingEntries.length}</strong> 个网段包含，无法导入：
        </p>
        <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
          {containingEntries.map((entry) => (
            <div key={entry.id} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #e0e0e0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag color={entry.label === 'A' ? 'blue' : entry.label === 'B' ? 'green' : 'default'}>
                  {entry.label}
                </Tag>
                <b style={{ fontFamily: 'monospace' }}>{entry.cidr}</b>
              </div>
              {entry.note && <div style={{ fontSize: '12px', color: '#666', marginTop: '4px', marginLeft: '32px' }}>{entry.note}</div>}
            </div>
          ))}
        </div>
      </Modal>

      {/* 批量导入模态框 */}
      <Modal
        title="批量导入IP段"
        open={batchImportModalOpen}
        onCancel={() => setBatchImportModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setBatchImportModalOpen(false)}>
            取消
          </Button>,
          <Button 
            key="import" 
            type="primary" 
            onClick={handleBatchImport} 
            loading={loading}
            disabled={!batchImportText.trim() || !batchImportLabel}
          >
            导入
          </Button>,
        ]}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>选择分组：</label>
          <Select
            style={{ width: '100%' }}
            value={batchImportLabel}
            onChange={setBatchImportLabel}
            options={labelOptions.map(opt => ({ value: opt, label: opt }))}
            placeholder="选择分组"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>备注（可选）：</label>
          <Input
            placeholder="为所有导入的IP段添加备注"
            value={batchImportNote}
            onChange={(e) => setBatchImportNote(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>IP段列表（一行一个）：</label>
          <TextArea
            rows={10}
            placeholder={`例如：\n47.82\n47.82.123\n192.168.1.100 (IPv4)\n2001:db8:\n2001:db8:8544 (IPv6)`}
            value={batchImportText}
            onChange={(e) => setBatchImportText(e.target.value)}
            style={{ fontFamily: 'monospace' }}
          />
        </div>

        {batchImportResults.length > 0 && (
          <div>
            <div style={{ marginBottom: 16, fontSize: '13px' }}>
              <p style={{ marginBottom: 8 }}>💡 导入结果：</p>
              <p style={{ color: '#52c41a', marginBottom: 8 }}>• <strong>✓ 成功</strong>：{batchImportResults.filter(r => r.status === 'success').length} 个</p>
              <p style={{ color: '#ff4d4f', marginBottom: 8 }}>• <strong>✗ 错误</strong>：{batchImportResults.filter(r => r.status === 'error').length} 个</p>
              <p style={{ color: '#999', marginBottom: 8 }}>• <strong>⊘ 跳过</strong>：{batchImportResults.filter(r => r.status === 'skipped').length} 个</p>
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
              {batchImportResults.map((result, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: '12px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      color: result.status === 'success' ? '#52c41a' : result.status === 'conflict' ? '#faad14' : result.status === 'skipped' ? '#999' : '#ff4d4f',
                      fontWeight: 'bold',
                      minWidth: '24px',
                      fontSize: '16px'
                    }}>
                      {result.status === 'success' ? '✓' : result.status === 'conflict' ? '⚠' : result.status === 'skipped' ? '⊘' : '✗'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 500 }}>
                        {result.original} {result.cidr !== result.original && <span style={{ color: '#1890ff' }}>→ {result.cidr}</span>}
                      </div>
                      {result.error && result.status !== 'success' && (
                        <div style={{ fontSize: '12px', color: result.status === 'skipped' ? '#999' : '#ff4d4f' }}>
                          {result.error}
                          {result.status === 'conflict' && (
                            <span style={{ color: '#faad14', marginLeft: '4px' }}>(冲突)</span>
                          )}
                        </div>
                      )}
                      {result.conflictedEntries && result.status === 'conflict' && (
                        <div style={{ fontSize: '11px', color: '#faad14', marginTop: '4px' }}>
                          被：{result.conflictedEntries.map((c: any, i: number) => (
                            <span key={c.id}>
                              {i > 0 && ', '}
                              <b>{c.cidr}</b> (组{c.label})
                            </span>
                          ))} 包含
                        </div>
                      )}
                      {result.containingEntries && result.status === 'skipped' && result.error === '重复' && (
                        <div style={{ fontSize: '11px', color: '#722ed1', marginTop: '4px' }}>
                          被：{result.containingEntries.map((c: any, i: number) => (
                            <span key={c.id}>
                              {i > 0 && ', '}
                              <b>{c.cidr}</b> (组{c.label})
                            </span>
                          ))} 包含
                        </div>
                      )}
                    </div>
                  </div>
                  {result.status === 'conflict' && (
                    <div style={{ display: 'flex', gap: '8px', marginLeft: '32px' }}>
                      <Button
                        size="small"
                        type="primary"
                        danger
                        onClick={() => handleSingleOverwrite(index)}
                        loading={loading}
                      >
                        覆盖
                      </Button>
                      <Button
                        size="small"
                        onClick={() => handleSingleSkip(index)}
                      >
                        跳过
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
