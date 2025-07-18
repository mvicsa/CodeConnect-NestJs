import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop()
  // { default: 'https://randomuser.me/api/portraits/lego/1.jpg' }
  avatar: string;

  @Prop()
  //   {
  //   default: 'https://images.unsplash.com/photo-1503264116251-35a269479413',
  // }
  cover: string;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({
    type: [{ title: String, url: String }],
    default: [],
  })
  socialLinks: { title: string; url: string }[];

  @Prop({ type: Date, default: null })
  birthdate: Date;

  @Prop({ type: String, enum: Gender, default: null })
  gender: Gender;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;
}

export const UserSchema = SchemaFactory.createForClass(User);
