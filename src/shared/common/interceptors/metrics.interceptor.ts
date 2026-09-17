import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  private httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'path', 'status'],
  });

  private httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path'],
  });

  private httpErrorsTotal = new Counter({
    name: 'http_errors_total',
    help: 'Total number of HTTP errors',
    labelNames: ['method', 'path', 'status'],
  });

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, path } = request;

    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = (Date.now() - startTime) / 1000;
        const status = response.statusCode;

        this.httpRequestsTotal.inc({ method, path, status });
        this.httpRequestDuration.observe({ method, path }, duration);

        // Log slow requests
        if (duration > 1) {
          console.warn(
            `Slow request: ${method} ${path} took ${duration.toFixed(2)}s`,
          );
        }
      }),
      catchError((error) => {
        const duration = (Date.now() - startTime) / 1000;
        const status =
          error instanceof HttpException
            ? error.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

        this.httpRequestsTotal.inc({ method, path, status });
        this.httpRequestDuration.observe({ method, path }, duration);
        this.httpErrorsTotal.inc({ method, path, status });

        throw error;
      }),
    );
  }
}
