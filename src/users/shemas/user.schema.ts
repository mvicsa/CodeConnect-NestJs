import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty()
  @Prop({ required: true })
  firstName: string;

  @ApiProperty()
  @Prop({ required: true })
  lastName: string;

  @ApiProperty()
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @ApiProperty({ default: 'https://randomuser.me/api/portraits/lego/1.jpg' })
  @Prop({ default: 'https://randomuser.me/api/portraits/lego/1.jpg' })
  avatar: string;

  @ApiProperty({ default: 'https://images.unsplash.com/photo-1503264116251-35a269479413' })
  @Prop({
    default: 'https://images.unsplash.com/photo-1503264116251-35a269479413',
  })
  cover: string;

  @ApiProperty({ type: [String], default: [] })
  @Prop({ type: [String], default: [] })
  skills: string[];

  @ApiProperty({
    description: 'Array of social links with title and url',
    isArray: true,
    type: Object,
    example: [{ title: 'GitHub', url: 'https://github.com/username' }],
    default: [],
  })
  @Prop({
    type: [{ title: String, url: String }],
    default: [],
  })
  socialLinks: { title: string; url: string }[];

  @ApiProperty({ type: String, required: false, nullable: true })
  @Prop({ type: Date, default: null })
  birthdate: Date;

  @ApiProperty({ enum: Gender, required: false, nullable: true })
  @Prop({ type: String, enum: Gender, default: null })
  gender: Gender;

  @ApiProperty({ enum: UserRole })
  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'ChatRoom' }], default: [] })
  chatRooms: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Group' }], default: [] })
  groups: Types.ObjectId[];

  @Prop({ type: [{ type: String, ref: 'User' }], default: [] })
  followers: string[];

  @Prop({ type: [{ type: String, ref: 'User' }], default: [] })
  following: string[];

  @ApiProperty({ required: false, nullable: true })
  @Prop({ type: String, default: null })
  bio?: string;

  @ApiProperty({ required: false, nullable: true })
  @Prop({ type: String, default: null })
  city?: string;

  @ApiProperty({ required: false, nullable: true })
  @Prop({ type: String, default: null })
  country?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
