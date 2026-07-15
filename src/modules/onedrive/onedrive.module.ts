import { Module } from '@nestjs/common';
import { MicrosoftGraphAuthService } from './services/microsoft-graph-auth.service';
import { OneDriveUploadService } from './services/onedrive-upload.service';

/**
 * Integração Microsoft Graph / OneDrive (conta fixa via refresh token).
 */
@Module({
  providers: [MicrosoftGraphAuthService, OneDriveUploadService],
  exports: [MicrosoftGraphAuthService, OneDriveUploadService],
})
export class OneDriveModule {}
