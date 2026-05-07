export type ApiErrorResponse = {
  success: false;
  error: string;
};

export type ApiSuccessResponse<T> = T & {
  success: true;
};
