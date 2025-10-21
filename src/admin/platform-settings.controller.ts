import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UserRole } from 'src/users/shemas/user.schema';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { PlatformSettingsService } from './platform-settings.service';

@ApiTags('Admin Platform Settings')
@Controller('admin/platform-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class PlatformSettingsController {
  constructor(private readonly platformSettingsService: PlatformSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all platform settings' })
  @ApiResponse({ status: 200, description: 'Platform settings retrieved successfully' })
  async getAllSettings() {
    return this.platformSettingsService.getAllSettings();
  }

  @Put('fee-percentage')
  @ApiOperation({ summary: 'Update platform fee percentage' })
  @ApiResponse({ status: 200, description: 'Platform fee percentage updated successfully' })
  async updatePlatformFeePercentage(
    @Body('percentage') percentage: number,
    @GetUser('sub') updatedBy: string,
  ) {
    return this.platformSettingsService.updateSetting('platformFeePercentage', percentage, updatedBy);
  }

  @Put('escrow-period')
  @ApiOperation({ summary: 'Update escrow period in days' })
  @ApiResponse({ status: 200, description: 'Escrow period updated successfully' })
  async updateEscrowPeriod(
    @Body('days') days: number,
    @GetUser('sub') updatedBy: string,
  ) {
    return this.platformSettingsService.updateSetting('escrowPeriod', days, updatedBy);
  }

  @Put('admin-bypass-escrow')
  @ApiOperation({ summary: 'Toggle admin bypass for escrow period' })
  @ApiResponse({ status: 200, description: 'Admin bypass escrow setting updated successfully' })
  async toggleAdminBypassEscrow(
    @Body('enabled') enabled: boolean,
    @GetUser('sub') updatedBy: string,
  ) {
    return this.platformSettingsService.updateSetting('adminBypassEscrow', enabled, updatedBy);
  }
}

