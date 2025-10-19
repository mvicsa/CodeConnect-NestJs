import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlatformSettings, PlatformSettingsDocument } from './schemas/platform-settings.schema';

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectModel(PlatformSettings.name)
    private readonly platformSettingsModel: Model<PlatformSettingsDocument>,
  ) {}

  async getSetting(key: string): Promise<any> {
    const setting = await this.platformSettingsModel.findOne({ key });
    return setting ? setting.value : null;
  }

  async getAllSettings(): Promise<Record<string, any>> {
    const settings = await this.platformSettingsModel.find({});
    return settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
  }

  async getPlatformSettings(): Promise<{
    platformFeePercentage: number;
    escrowPeriod: number;
    adminBypassEscrow: boolean;
  }> {
    const settings = await this.platformSettingsModel.find({});
    const settingsMap = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});

    // Ensure default values if not found in DB
    return {
      platformFeePercentage: settingsMap['platformFeePercentage'] || 20,
      escrowPeriod: settingsMap['escrowPeriod'] || 14,
      adminBypassEscrow: settingsMap['adminBypassEscrow'] || false,
    };
  }

  async updateSetting(key: string, value: any, updatedBy: string): Promise<PlatformSettingsDocument> {
    // Basic validation based on key
    switch (key) {
      case 'platformFeePercentage':
        if (typeof value !== 'number' || value < 5 || value > 50) {
          throw new BadRequestException('Platform fee percentage must be a number between 5 and 50.');
        }
        break;
      case 'escrowPeriod':
        if (typeof value !== 'number' || value < 1 || value > 90) {
          throw new BadRequestException('Escrow period must be a number of days between 1 and 90.');
        }
        break;
      case 'adminBypassEscrow':
        if (typeof value !== 'boolean') {
          throw new BadRequestException('Admin bypass escrow must be a boolean value.');
        }
        break;
      default:
        // No specific validation for other settings, but you can add more as needed
        break;
    }

    return this.platformSettingsModel.findOneAndUpdate(
      { key },
      { value, updatedBy, updatedAt: new Date() },
      { new: true, upsert: true }
    );
  }

  async initializeDefaultSettings(adminId: string) {
    const defaultSettings = [
      { key: 'platformFeePercentage', value: 20 }, // 20% default
      { key: 'escrowPeriod', value: 14 }, // 14 days default
      { key: 'adminBypassEscrow', value: false }, // Default to false
    ];

    for (const setting of defaultSettings) {
      await this.platformSettingsModel.findOneAndUpdate(
        { key: setting.key },
        { value: setting.value, updatedBy: adminId, updatedAt: new Date() },
        { upsert: true, new: true }
      );
    }
  }
}

