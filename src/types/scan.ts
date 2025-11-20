export interface ScanResult {
  id: string;
  target_url: string;
  scan_status: 'pending' | 'processing' | 'completed' | 'failed';
  overall_score?: number;
  ai_summary?: string;
  ai_recommendations?: string[];
  performance_score?: number;
  seo_score?: number;
  accessibility_issue_count?: number;
  security_checks_passed?: number;
  security_checks_total?: number;
  technologies?: string[];
  exposed_endpoints?: string[];
  e2e_results: Record<string, unknown>;
  api_results: Record<string, unknown>;
  security_results: Record<string, unknown>;
  performance_results: Record<string, unknown>;
  accessibility_results: Record<string, unknown>;
  seo_results?: Record<string, unknown>;
  tech_stack: Record<string, unknown>;
  top_issues: TopIssue[];
  created_at: string;
  expires_at: string;
}

export interface TopIssue {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface EmailSubmission {
  scan_id: string;
  email: string;
  opted_in_storage: boolean;
}
