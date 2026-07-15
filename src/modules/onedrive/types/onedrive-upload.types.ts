export interface OneDriveUploadResult {
  id: string;
  name: string;
  webUrl: string | null;
  size: number | null;
}

export interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface GraphDriveItemResponse {
  id?: string;
  name?: string;
  webUrl?: string;
  size?: number;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface GraphCreateLinkResponse {
  id?: string;
  roles?: string[];
  link?: {
    type?: string;
    scope?: string;
    webUrl?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}
