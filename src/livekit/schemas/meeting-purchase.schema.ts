import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { PurchaseStatus } from '../enums/purchase-status.enum';

@Schema({ timestamps: true })
export class MeetingPurchase {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LivekitRoom', required: true })
  roomId: Types.ObjectId;

  @Prop({ required: true })
  amountPaid: number;

  @Prop({ required: true })
  currencyUsed: string;

  @Prop({ required: true })
  transactionId: string;

  // إضافة حقول جديدة للحالة ورد الأموال
  @Prop({ 
    type: String, 
    enum: Object.values(PurchaseStatus), 
  })
  status: PurchaseStatus;

  @Prop({ type: Date })
  refundedAt?: Date;

  @Prop({ default: () => new Date() })
  purchaseDate: Date;

  // حقول جديدة للـ timeout والـ retry management
  // @Prop({ type: Date })
  // expiresAt?: Date; // وقت انتهاء الـ pending purchase (15 دقيقة)

  @Prop({ type: String })
  failureReason?: string; // سبب فشل الشراء


  @Prop({ type: String })
  stripePaymentIntentId?: string; // Stripe Payment Intent ID
}

export type MeetingPurchaseDocument = MeetingPurchase & Document;

export const MeetingPurchaseSchema = SchemaFactory.createForClass(MeetingPurchase);

MeetingPurchaseSchema.index({ userId: 1, roomId: 1 }, { unique: true });
