export type Company = {
  id: string;
  name: string;
  planTier?: string | null;
  createdAt: string;
};

export type CompanyUser = {
  id: string;
  userId: string;
  companyId: string;
  createdAt: string;
};
