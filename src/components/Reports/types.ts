export interface Daily {
  date: string;
  site: string | null;
  sites: string[];
  photo_base: string;
  totals: {
    inspections: number;
    trackers_checked: number;
    blocks_touched: number;
    trackers_with_issues: number;
    broken_panels: number;
    trackers_total: number;
  };
  blocks: { block: number; trackers_checked: number; trackers_total: number; issues: number; broken_panels: number }[];
  staff: {
    username: string;
    first_name: string | null;
    last_name: string | null;
    inspections: number;
    trackers_checked: number;
    issues: number;
    broken_panels: number;
    first_at: string;
    last_at: string;
  }[];
  issues: {
    id: number;
    site: string;
    block: number;
    tracker: number;
    panel: number | null;
    broken_panels: number;
    defects: string[] | null;
    notes: string | null;
    photo_keys: string[] | null;
    username: string;
    first_name: string | null;
    last_name: string | null;
    inspected_at: string;
  }[];
  trackers: {
    site: string;
    block: number;
    tracker: number;
    broken_panels: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
    inspected_at: string;
  }[];
  defect_counts: { defect: string; panels: number }[];
}
