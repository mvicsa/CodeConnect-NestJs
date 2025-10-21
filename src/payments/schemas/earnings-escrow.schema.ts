import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EarningsEscrowDocument = EarningsEscrow & Document;

@Schema({ timestamps: true })
export class EarningsEscrow {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LivekitRoom', required: true })
  roomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'MeetingPurchase', required: true })
  purchaseId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  grossAmount: number;

  @Prop({ required: false })
  netAmount?: number; // Net amount after Stripe fees

  @Prop({ required: false })
  stripeFees?: number; // Stripe fees deducted

  @Prop({ required: true, min: 0, max: 100 })
  feeAtTransactionTime: number;

  @Prop({ required: true, default: 'USD' })
  currency: string;

  @Prop({ 
    type: String, 
    enum: ['pending', 'released', 'refunded', 'disputed', 'withdrawn'], 
    default: 'pending' 
  })
  status: string;

  @Prop({ 
    type: String, 
    enum: ['creator', 'platform'], 
    required: true 
  })
  type: string;

  @Prop({ type: Date, required: true })
  releaseDate: Date;

  @Prop({ type: Date })
  releasedAt?: Date;

  @Prop({ type: Date })
  refundedAt?: Date;

  @Prop({ type: Date })
  withdrawnAt?: Date;

  @Prop({ type: String })
  reason?: string;

  @Prop({ type: String, required: false })
  originalTransferId?: string; // Transfer ID from the original payment to creator
}

export const EarningsEscrowSchema = SchemaFactory.createForClass(EarningsEscrow);

// إضافة فهرس مركب للبحث والفلترة بكفاءة
EarningsEscrowSchema.index({ 
  creatorId: 1, 
  status: 1, 
  releaseDate: 1 
});
