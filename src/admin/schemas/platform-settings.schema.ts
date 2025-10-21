import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlatformSettingsDocument = PlatformSettings & Document;

@Schema({ timestamps: true })
export class PlatformSettings {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true, type: Object })
  value: any; // Can be number, string, boolean, etc.

  @Prop({ default: Date.now })
  updatedAt: Date;

  @Prop({ required: true })
  updatedBy: string; // userId of the admin who last updated it
}

export const PlatformSettingsSchema = SchemaFactory.createForClass(PlatformSettings);

