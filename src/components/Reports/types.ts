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

/** /reports/repairs: panels fixed or replaced over one day or a range of days */
export interface RepairData {
  date: string;
  date_from: string;
  site: string | null;
  sites: string[];
  photo_base: string;
  totals: {
    panels: number;
    fixed: number;
    replaced: number;
    trackers: number;
    blocks_touched: number;
    days: number;
    before_photos: number;
    after_photos: number;
    with_both: number;
    first_at: string | null;
    last_at: string | null;
  };
  blocks: { block: number; panels: number; fixed: number; replaced: number; trackers: number; photos: number }[];
  staff: {
    username: string;
    first_name: string | null;
    last_name: string | null;
    panels: number;
    fixed: number;
    replaced: number;
    first_at: string;
    last_at: string;
  }[];
  repairs: {
    id: number;
    site: string;
    block: number;
    tracker: number;
    panel: number;
    action: "fix" | "replace";
    notes: string;
    before_keys: string[];
    after_keys: string[];
    username: string;
    first_name: string | null;
    last_name: string | null;
    repaired_at: string;
    work_date: string;
  }[];
}
