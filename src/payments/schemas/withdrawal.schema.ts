import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WithdrawalDocument = Withdrawal & Document;

export enum WithdrawalStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

@Schema({ timestamps: true })
export class Withdrawal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, default: 'USD' })
  currency: string;

  @Prop({ 
    type: String, 
    enum: WithdrawalStatus, 
    default: WithdrawalStatus.PENDING 
  })
  status: WithdrawalStatus;

  @Prop({ type: String, required: false })
  stripePayoutId?: string;

  @Prop({ type: String, required: false })
  stripeTransferId?: string;

  @Prop({ type: Date, required: false })
  processedAt?: Date;

  @Prop({ type: Date, required: false })
  completedAt?: Date;

  @Prop({ type: Date, required: false })
  failedAt?: Date;

  @Prop({ type: String, required: false })
  failureReason?: string;

  @Prop({ type: String, required: false })
  description?: string;

  @Prop({ type: String, required: false })
  bankAccountLast4?: string;

  @Prop({ type: String, required: false })
  bankAccountType?: string;

  @Prop({ type: String, required: false })
  bankName?: string;

  @Prop({ type: Number, required: false })
  stripeFees?: number; // Fees charged by Stripe for this withdrawal

  @Prop({ type: Number, required: false })
  netAmount?: number; // Amount after Stripe fees

  @Prop({ type: String, required: false })
  notes?: string; // Internal notes for admin use
}

export const WithdrawalSchema = SchemaFactory.createForClass(Withdrawal);

// إضافة فهارس للبحث والفلترة بكفاءة
WithdrawalSchema.index({ 
  creatorId: 1, 
  status: 1, 
  createdAt: -1 
});

WithdrawalSchema.index({ 
  stripePayoutId: 1 
});

WithdrawalSchema.index({ 
  createdAt: -1 
});
