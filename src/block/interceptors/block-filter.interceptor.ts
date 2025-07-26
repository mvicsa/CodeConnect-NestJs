import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BlockService } from '../block.service';

@Injectable()
export class BlockFilterInterceptor implements NestInterceptor {
  constructor(private readonly blockService: BlockService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return next.handle();
    }

    return next.handle().pipe(
      map(async (data: any) => {
        // If data is an array of users, filter out blocked users
        if (Array.isArray(data)) {
          const filteredData: any[] = [];
          for (const item of data) {
            if (item._id || item.id) {
              const userId = item._id || item.id;
              const isBlocked = await this.blockService.isBlocked(user.id, userId);
              const isBlockedBy = await this.blockService.isBlockedBy(user.id, userId);
              
              if (!isBlocked && !isBlockedBy) {
                filteredData.push(item);
              }
            } else {
              filteredData.push(item);
            }
          }
          return filteredData;
        }

        // If data is a single user object, check if blocked
        if (data && (data._id || data.id)) {
          const userId = data._id || data.id;
          const isBlocked = await this.blockService.isBlocked(user.id, userId);
          const isBlockedBy = await this.blockService.isBlockedBy(user.id, userId);
          
          if (isBlocked || isBlockedBy) {
            return null; // Return null for blocked users
          }
        }

        return data;
      }),
    );
  }
}