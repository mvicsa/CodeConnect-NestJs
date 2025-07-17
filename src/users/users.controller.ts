import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':username')
  @ApiOkResponse({ description: 'Public user profile returned.' })
  @ApiNotFoundResponse({ description: 'User not found.' })
  async getUserProfile(@Param('username') username: string) {
    return this.usersService.findByUsername(username);
  }

  @Get()
  @ApiOkResponse({ description: 'List of all users returned.' })
  async getAllUsers() {
    return this.usersService.findAll();
  }
}
