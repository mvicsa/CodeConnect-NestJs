import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BlockService } from '../block.service';

@Injectable()
export class BlockGuard implements CanActivate {
  constructor(private readonly blockService: BlockService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const targetUserId = request.params.userId || request.body.userId || request.query.userId;

    if (!user || !targetUserId) {
      return true; // Allow if no user context or target user
    }

    // Check if current user is blocked by target user
    const isBlockedBy = await this.blockService.isBlockedBy(user.sub, targetUserId);
    if (isBlockedBy) {
      throw new ForbiddenException('You cannot interact with this user as they have blocked you');
    }

    // Check if current user has blocked target user
    const isBlocked = await this.blockService.isBlocked(user.sub, targetUserId);
    if (isBlocked) {
      throw new ForbiddenException('You cannot interact with this user as you have blocked them');
    }

    return true;
  }
}