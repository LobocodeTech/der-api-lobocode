import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';

export class ActivitiesNotificationPatchDto {
  @IsOptional()
  @IsBoolean()
  assignments?: boolean;

  @IsOptional()
  @IsBoolean()
  comments?: boolean;

  @IsOptional()
  @IsBoolean()
  deadlines?: boolean;

  @IsOptional()
  @IsBoolean()
  reports?: boolean;
}

export class UpdateMyNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  notificationEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationPushNotification?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ActivitiesNotificationPatchDto)
  activitiesNotification?: ActivitiesNotificationPatchDto;
}
