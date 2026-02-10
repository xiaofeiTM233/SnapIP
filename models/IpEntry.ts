// models/IpEntry.ts
import mongoose, { Schema, model, models } from 'mongoose';

const IpEntrySchema = new Schema({
  cidr: {
    type: String,
    required: [true, 'CIDR is required'],
    unique: true, // 物理唯一，防止完全重复
    trim: true,
  },
  label: {
    type: String,
    required: [true, 'Label/Group is required'], // A, B, etc.
    index: true,
  },
  note: { type: String }, // 备注
  createdAt: { type: Date, default: Date.now },
});

// 防止热重载重复编译模型
const IpEntry = models.IpEntry || model('IpEntry', IpEntrySchema);

export default IpEntry;
