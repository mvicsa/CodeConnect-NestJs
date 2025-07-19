import { AuthGuard } from '@nestjs/passport';
import { Injectable, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Add custom logic for socket.io if needed
    return super.canActivate(context);
  }
}
