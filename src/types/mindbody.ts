export interface Client {
  id: string;
  mindbody_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile_phone: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  creation_date: string | null;
  synced_at: string;
}

export interface Appointment {
  id: string;
  mindbody_id: string;
  client_id: string | null;
  staff_id: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  status: string | null;
  synced_at: string;
}

export interface ClassData {
  id: string;
  mindbody_id: string;
  class_description_id: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  total_booked: number;
  max_capacity: number;
  is_canceled: boolean;
  synced_at: string;
}

export interface Sale {
  id: string;
  mindbody_id: string;
  sale_datetime: string | null;
  client_id: string | null;
  total: number;
  payment_amount: number;
  synced_at: string;
}

export interface Staff {
  id: string;
  mindbody_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  synced_at: string;
}

export interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_synced: number;
  error_message: string | null;
}

export interface PivotTableConfig {
  rows: string[];
  columns: string[];
  values: string[];
  aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max';
}
