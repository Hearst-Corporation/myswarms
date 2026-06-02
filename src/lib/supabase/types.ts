type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_template_access: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          template_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          template_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          template_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_template_access_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
        ]
      }
      chief_decisions: {
        Row: {
          action: Database["public"]["Enums"]["chief_decision_action"]
          chief_run_id: string
          created_at: string
          id: string
          owner_id: string | null
          snooze_until: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["chief_decision_action"]
          chief_run_id: string
          created_at?: string
          id?: string
          owner_id?: string | null
          snooze_until?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["chief_decision_action"]
          chief_run_id?: string
          created_at?: string
          id?: string
          owner_id?: string | null
          snooze_until?: string | null
        }
        Relationships: []
      }
      chief_run_log: {
        Row: {
          error_text: string | null
          finished_at: string | null
          id: string
          kickoff_id: string
          langfuse_trace_id: string | null
          owner_id: string | null
          result: string | null
          started_at: string
          state_json: Json | null
          status: string
          total_tokens_in: number
          total_tokens_out: number
          trigger: string
        }
        Insert: {
          error_text?: string | null
          finished_at?: string | null
          id?: string
          kickoff_id: string
          langfuse_trace_id?: string | null
          owner_id?: string | null
          result?: string | null
          started_at?: string
          state_json?: Json | null
          status: string
          total_tokens_in?: number
          total_tokens_out?: number
          trigger: string
        }
        Update: {
          error_text?: string | null
          finished_at?: string | null
          id?: string
          kickoff_id?: string
          langfuse_trace_id?: string | null
          owner_id?: string | null
          result?: string | null
          started_at?: string
          state_json?: Json | null
          status?: string
          total_tokens_in?: number
          total_tokens_out?: number
          trigger?: string
        }
        Relationships: []
      }
      chief_run_steps: {
        Row: {
          agent_name: string
          chief_run_id: string
          cost_usd: number
          created_at: string
          finished_at: string | null
          id: string
          langfuse_span_id: string | null
          latency_ms: number | null
          output_text: string | null
          owner_id: string | null
          started_at: string
          step_index: number
          task_name: string | null
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          agent_name: string
          chief_run_id: string
          cost_usd?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          owner_id?: string | null
          started_at?: string
          step_index: number
          task_name?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          agent_name?: string
          chief_run_id?: string
          cost_usd?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          owner_id?: string | null
          started_at?: string
          step_index?: number
          task_name?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: []
      }
      cockpit_chats: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cockpit_messages: {
        Row: {
          chat_id: string | null
          content: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          chat_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          chat_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "cockpit_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "cockpit_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_run_steps: {
        Row: {
          agent_name: string
          cost_usd: number
          created_at: string
          id: string
          input_text: string | null
          langfuse_span_id: string | null
          latency_ms: number | null
          output_text: string | null
          role: string | null
          run_id: string
          step_index: number
          task_name: string | null
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          agent_name: string
          cost_usd?: number
          created_at?: string
          id?: string
          input_text?: string | null
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          role?: string | null
          run_id: string
          step_index: number
          task_name?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          agent_name?: string
          cost_usd?: number
          created_at?: string
          id?: string
          input_text?: string | null
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          role?: string | null
          run_id?: string
          step_index?: number
          task_name?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "crew_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "crew_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_runs: {
        Row: {
          crew_id: string
          error_text: string | null
          finished_at: string | null
          id: string
          inputs_json: Json
          langfuse_trace_id: string | null
          result_text: string | null
          started_at: string
          status: Database["public"]["Enums"]["crew_run_status"]
          total_cost_usd: number
          total_tokens_in: number
          total_tokens_out: number
          trigger: Database["public"]["Enums"]["crew_trigger"]
        }
        Insert: {
          crew_id: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          inputs_json?: Json
          langfuse_trace_id?: string | null
          result_text?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          total_cost_usd?: number
          total_tokens_in?: number
          total_tokens_out?: number
          trigger: Database["public"]["Enums"]["crew_trigger"]
        }
        Update: {
          crew_id?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          inputs_json?: Json
          langfuse_trace_id?: string | null
          result_text?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          total_cost_usd?: number
          total_tokens_in?: number
          total_tokens_out?: number
          trigger?: Database["public"]["Enums"]["crew_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "crew_runs_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          spec_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          spec_json?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          spec_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      flow_states: {
        Row: {
          checkpoint: string
          created_at: string
          id: string
          run_id: string
          state_json: Json
        }
        Insert: {
          checkpoint: string
          created_at?: string
          id?: string
          run_id: string
          state_json: Json
        }
        Update: {
          checkpoint?: string
          created_at?: string
          id?: string
          run_id?: string
          state_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flow_states_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "crew_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hedge_audit_log: {
        Row: {
          actor_id: string | null
          actor_kind: string
          chain_seq: number
          created_at: string
          details: Json
          event_type: string
          id: string
          ip_address: unknown
          prev_hash: string | null
          request_id: string | null
          row_hash: string
          severity: string
          source_service: string | null
          tenant_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          chain_seq: number
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          ip_address?: unknown
          prev_hash?: string | null
          request_id?: string | null
          row_hash: string
          severity: string
          source_service?: string | null
          tenant_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          chain_seq?: number
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          ip_address?: unknown
          prev_hash?: string | null
          request_id?: string | null
          row_hash?: string
          severity?: string
          source_service?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      hedge_exec_orders_outbox: {
        Row: {
          attempts: number
          client_order_id: string
          created_at: string
          decision_id: string
          id: string
          last_error: string | null
          leg_index: number
          locked_at: string | null
          locked_by: string | null
          order_payload: Json
          prev_hash: string | null
          request_id: string
          row_hash: string
          signature: string
          status: string
          tenant_id: string
          ttl_at: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          client_order_id: string
          created_at?: string
          decision_id: string
          id?: string
          last_error?: string | null
          leg_index: number
          locked_at?: string | null
          locked_by?: string | null
          order_payload: Json
          prev_hash?: string | null
          request_id: string
          row_hash: string
          signature: string
          status?: string
          tenant_id: string
          ttl_at: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          client_order_id?: string
          created_at?: string
          decision_id?: string
          id?: string
          last_error?: string | null
          leg_index?: number
          locked_at?: string | null
          locked_by?: string | null
          order_payload?: Json
          prev_hash?: string | null
          request_id?: string
          row_hash?: string
          signature?: string
          status?: string
          tenant_id?: string
          ttl_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hedge_exec_orders_outbox_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "hedge_risk_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedge_exec_orders_outbox_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: false
            referencedRelation: "hedge_strategy_requests"
            referencedColumns: ["tenant_id", "request_id"]
          },
        ]
      }
      hedge_execution_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          decision_id: string | null
          id: string
          kind: string
          outbox_id: string | null
          payload: Json
          request_id: string | null
          severity: string
          symbol: string | null
          tenant_id: string | null
          venue: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          decision_id?: string | null
          id?: string
          kind: string
          outbox_id?: string | null
          payload?: Json
          request_id?: string | null
          severity: string
          symbol?: string | null
          tenant_id?: string | null
          venue?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          decision_id?: string | null
          id?: string
          kind?: string
          outbox_id?: string | null
          payload?: Json
          request_id?: string | null
          severity?: string
          symbol?: string | null
          tenant_id?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      hedge_execution_reports: {
        Row: {
          avg_fill_price: number | null
          client_order_id: string
          decision_id: string
          dry_run: boolean
          error_code: string | null
          error_message: string | null
          fees_usd: number | null
          filled_size: number | null
          id: string
          latency_ms: number | null
          outbox_id: string
          prev_hash: string | null
          request_id: string
          requested_size: number | null
          row_hash: string
          side: string | null
          status: string
          submitted_at: string
          symbol: string
          tenant_id: string
          venue: string
          venue_order_id: string | null
          venue_response: Json | null
        }
        Insert: {
          avg_fill_price?: number | null
          client_order_id: string
          decision_id: string
          dry_run?: boolean
          error_code?: string | null
          error_message?: string | null
          fees_usd?: number | null
          filled_size?: number | null
          id?: string
          latency_ms?: number | null
          outbox_id: string
          prev_hash?: string | null
          request_id: string
          requested_size?: number | null
          row_hash: string
          side?: string | null
          status: string
          submitted_at?: string
          symbol: string
          tenant_id: string
          venue: string
          venue_order_id?: string | null
          venue_response?: Json | null
        }
        Update: {
          avg_fill_price?: number | null
          client_order_id?: string
          decision_id?: string
          dry_run?: boolean
          error_code?: string | null
          error_message?: string | null
          fees_usd?: number | null
          filled_size?: number | null
          id?: string
          latency_ms?: number | null
          outbox_id?: string
          prev_hash?: string | null
          request_id?: string
          requested_size?: number | null
          row_hash?: string
          side?: string | null
          status?: string
          submitted_at?: string
          symbol?: string
          tenant_id?: string
          venue?: string
          venue_order_id?: string | null
          venue_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "hedge_execution_reports_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "hedge_risk_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedge_execution_reports_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "hedge_exec_orders_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedge_execution_reports_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: false
            referencedRelation: "hedge_strategy_requests"
            referencedColumns: ["tenant_id", "request_id"]
          },
        ]
      }
      hedge_kill_switches: {
        Row: {
          active: boolean
          cleared_at: string | null
          cleared_by: string | null
          id: string
          reason: string | null
          scope: string
          set_at: string
          set_by: string | null
          tenant_id: string | null
          venue: string | null
        }
        Insert: {
          active?: boolean
          cleared_at?: string | null
          cleared_by?: string | null
          id?: string
          reason?: string | null
          scope: string
          set_at?: string
          set_by?: string | null
          tenant_id?: string | null
          venue?: string | null
        }
        Update: {
          active?: boolean
          cleared_at?: string | null
          cleared_by?: string | null
          id?: string
          reason?: string | null
          scope?: string
          set_at?: string
          set_by?: string | null
          tenant_id?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      hedge_market_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          severity: string
          source_event_ts: string | null
          symbol: string | null
          venue: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          severity: string
          source_event_ts?: string | null
          symbol?: string | null
          venue: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          severity?: string
          source_event_ts?: string | null
          symbol?: string | null
          venue?: string
        }
        Relationships: []
      }
      hedge_market_snapshots: {
        Row: {
          created_at: string
          id: string
          payload: Json
          prev_hash: string | null
          row_hash: string
          signature: string
          source: string
          source_event_ts: string
          symbol: string
          taken_at: string
          timeframe: string
          venue: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          prev_hash?: string | null
          row_hash: string
          signature: string
          source: string
          source_event_ts: string
          symbol: string
          taken_at?: string
          timeframe: string
          venue: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          prev_hash?: string | null
          row_hash?: string
          signature?: string
          source?: string
          source_event_ts?: string
          symbol?: string
          taken_at?: string
          timeframe?: string
          venue?: string
        }
        Relationships: []
      }
      hedge_orderbook_snapshots: {
        Row: {
          created_at: string
          id: string
          payload: Json
          prev_hash: string | null
          row_hash: string
          signature: string
          source_event_ts: string
          symbol: string
          taken_at: string
          venue: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          prev_hash?: string | null
          row_hash: string
          signature: string
          source_event_ts: string
          symbol: string
          taken_at?: string
          venue: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          prev_hash?: string | null
          row_hash?: string
          signature?: string
          source_event_ts?: string
          symbol?: string
          taken_at?: string
          venue?: string
        }
        Relationships: []
      }
      hedge_portfolio_snapshots: {
        Row: {
          created_at: string
          id: string
          payload: Json
          prev_hash: string | null
          row_hash: string
          signature: string
          source: string
          taken_at: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          prev_hash?: string | null
          row_hash: string
          signature: string
          source: string
          taken_at?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          prev_hash?: string | null
          row_hash?: string
          signature?: string
          source?: string
          taken_at?: string
          tenant_id?: string
        }
        Relationships: []
      }
      hedge_position_reconciliations: {
        Row: {
          created_at: string
          cycle_at: string
          db_positions: Json
          diff_count: number
          diffs: Json
          id: string
          prev_hash: string | null
          remediation: Json
          row_hash: string
          status: string
          tenant_id: string
          venue: string
          venue_positions: Json
          worst_diff_usd: number
        }
        Insert: {
          created_at?: string
          cycle_at?: string
          db_positions: Json
          diff_count?: number
          diffs?: Json
          id?: string
          prev_hash?: string | null
          remediation?: Json
          row_hash: string
          status: string
          tenant_id: string
          venue: string
          venue_positions: Json
          worst_diff_usd?: number
        }
        Update: {
          created_at?: string
          cycle_at?: string
          db_positions?: Json
          diff_count?: number
          diffs?: Json
          id?: string
          prev_hash?: string | null
          remediation?: Json
          row_hash?: string
          status?: string
          tenant_id?: string
          venue?: string
          venue_positions?: Json
          worst_diff_usd?: number
        }
        Relationships: []
      }
      hedge_risk_decisions: {
        Row: {
          computed_at: string
          decision: string
          decision_ttl_seconds: number
          engine_version: string
          expires_at: string
          id: string
          portfolio_snapshot_id: string
          prev_hash: string | null
          reason_codes: string[]
          request_id: string
          risk_profile_id: string
          row_hash: string
          rules_eval: Json
          signature: string
          signing_key_id: string
          sized_orders: Json
          spec_id: string
          tenant_id: string
        }
        Insert: {
          computed_at?: string
          decision: string
          decision_ttl_seconds?: number
          engine_version: string
          expires_at: string
          id?: string
          portfolio_snapshot_id: string
          prev_hash?: string | null
          reason_codes?: string[]
          request_id: string
          risk_profile_id: string
          row_hash: string
          rules_eval: Json
          signature: string
          signing_key_id?: string
          sized_orders: Json
          spec_id: string
          tenant_id: string
        }
        Update: {
          computed_at?: string
          decision?: string
          decision_ttl_seconds?: number
          engine_version?: string
          expires_at?: string
          id?: string
          portfolio_snapshot_id?: string
          prev_hash?: string | null
          reason_codes?: string[]
          request_id?: string
          risk_profile_id?: string
          row_hash?: string
          rules_eval?: Json
          signature?: string
          signing_key_id?: string
          sized_orders?: Json
          spec_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hedge_risk_decisions_portfolio_snapshot_id_fkey"
            columns: ["portfolio_snapshot_id"]
            isOneToOne: false
            referencedRelation: "hedge_portfolio_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedge_risk_decisions_risk_profile_id_fkey"
            columns: ["risk_profile_id"]
            isOneToOne: false
            referencedRelation: "hedge_tenant_risk_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedge_risk_decisions_spec_id_fkey"
            columns: ["spec_id"]
            isOneToOne: false
            referencedRelation: "hedge_strategy_specs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hedge_risk_decisions_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: true
            referencedRelation: "hedge_strategy_requests"
            referencedColumns: ["tenant_id", "request_id"]
          },
        ]
      }
      hedge_run_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          produced_by: string
          request_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          produced_by: string
          request_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          produced_by?: string
          request_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hedge_run_events_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: false
            referencedRelation: "hedge_strategy_requests"
            referencedColumns: ["tenant_id", "request_id"]
          },
        ]
      }
      hedge_run_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          plane: string
          request_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          plane: string
          request_id: string
          status: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          plane?: string
          request_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hedge_run_jobs_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: true
            referencedRelation: "hedge_strategy_requests"
            referencedColumns: ["tenant_id", "request_id"]
          },
        ]
      }
      hedge_strategy_requests: {
        Row: {
          context: Json
          created_at: string
          id: string
          intent_type: string
          normalized: Json
          prev_hash: string | null
          raw_intent: string
          request_id: string
          row_hash: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          intent_type: string
          normalized?: Json
          prev_hash?: string | null
          raw_intent: string
          request_id: string
          row_hash: string
          tenant_id: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          intent_type?: string
          normalized?: Json
          prev_hash?: string | null
          raw_intent?: string
          request_id?: string
          row_hash?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      hedge_strategy_specs: {
        Row: {
          confidence: number
          created_at: string
          id: string
          langfuse_trace_id: string | null
          model: string
          prev_hash: string | null
          request_id: string
          row_hash: string
          signature: string
          signing_key_id: string
          spec: Json
          spec_hash: string
          status: string
          swarm_signals_ref: string[]
          tenant_id: string
          validation_error: string | null
        }
        Insert: {
          confidence: number
          created_at?: string
          id?: string
          langfuse_trace_id?: string | null
          model: string
          prev_hash?: string | null
          request_id: string
          row_hash: string
          signature: string
          signing_key_id?: string
          spec: Json
          spec_hash: string
          status?: string
          swarm_signals_ref: string[]
          tenant_id: string
          validation_error?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          langfuse_trace_id?: string | null
          model?: string
          prev_hash?: string | null
          request_id?: string
          row_hash?: string
          signature?: string
          signing_key_id?: string
          spec?: Json
          spec_hash?: string
          status?: string
          swarm_signals_ref?: string[]
          tenant_id?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hedge_strategy_specs_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: true
            referencedRelation: "hedge_strategy_requests"
            referencedColumns: ["tenant_id", "request_id"]
          },
        ]
      }
      hedge_swarm_signals: {
        Row: {
          agent: string
          confidence: number | null
          created_at: string
          id: string
          langfuse_trace_id: string | null
          latency_ms: number | null
          model: string | null
          payload: Json
          payload_hash: string
          prev_hash: string | null
          request_id: string
          row_hash: string
          signature: string
          status: string
          tenant_id: string
        }
        Insert: {
          agent: string
          confidence?: number | null
          created_at?: string
          id?: string
          langfuse_trace_id?: string | null
          latency_ms?: number | null
          model?: string | null
          payload: Json
          payload_hash: string
          prev_hash?: string | null
          request_id: string
          row_hash: string
          signature: string
          status: string
          tenant_id: string
        }
        Update: {
          agent?: string
          confidence?: number | null
          created_at?: string
          id?: string
          langfuse_trace_id?: string | null
          latency_ms?: number | null
          model?: string | null
          payload?: Json
          payload_hash?: string
          prev_hash?: string | null
          request_id?: string
          row_hash?: string
          signature?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hedge_swarm_signals_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: false
            referencedRelation: "hedge_strategy_requests"
            referencedColumns: ["tenant_id", "request_id"]
          },
        ]
      }
      hedge_tenant_risk_profiles: {
        Row: {
          active: boolean
          allowed_assets: string[]
          allowed_venues: string[]
          atr_vol_target_pct: number
          created_at: string
          created_by: string | null
          cvar_99_max_pct: number
          daily_loss_limit_usd: number
          id: string
          kelly_cap: number
          max_drawdown_pct: number
          max_leverage: number
          per_asset_notional_cap_usd: number
          prev_hash: string | null
          row_hash: string
          tenant_id: string
          version: number
        }
        Insert: {
          active?: boolean
          allowed_assets?: string[]
          allowed_venues?: string[]
          atr_vol_target_pct?: number
          created_at?: string
          created_by?: string | null
          cvar_99_max_pct: number
          daily_loss_limit_usd?: number
          id?: string
          kelly_cap?: number
          max_drawdown_pct?: number
          max_leverage?: number
          per_asset_notional_cap_usd?: number
          prev_hash?: string | null
          row_hash: string
          tenant_id: string
          version: number
        }
        Update: {
          active?: boolean
          allowed_assets?: string[]
          allowed_venues?: string[]
          atr_vol_target_pct?: number
          created_at?: string
          created_by?: string | null
          cvar_99_max_pct?: number
          daily_loss_limit_usd?: number
          id?: string
          kelly_cap?: number
          max_drawdown_pct?: number
          max_leverage?: number
          per_asset_notional_cap_usd?: number
          prev_hash?: string | null
          row_hash?: string
          tenant_id?: string
          version?: number
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_agents: {
        Row: {
          created_at: string
          id: string
          max_tokens: number | null
          model_name: string | null
          model_provider: string | null
          name: string
          parent_agent_id: string | null
          position_x: number
          position_y: number
          role: Database["public"]["Enums"]["agent_role"]
          swarm_id: string
          system_prompt: string | null
          temperature: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_tokens?: number | null
          model_name?: string | null
          model_provider?: string | null
          name: string
          parent_agent_id?: string | null
          position_x?: number
          position_y?: number
          role: Database["public"]["Enums"]["agent_role"]
          swarm_id: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_tokens?: number | null
          model_name?: string | null
          model_provider?: string | null
          name?: string
          parent_agent_id?: string | null
          position_x?: number
          position_y?: number
          role?: Database["public"]["Enums"]["agent_role"]
          swarm_id?: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swarm_agents_parent_agent_id_fkey"
            columns: ["parent_agent_id"]
            isOneToOne: false
            referencedRelation: "swarm_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_agents_swarm_id_fkey"
            columns: ["swarm_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_run_steps: {
        Row: {
          agent_id: string | null
          cost_usd: number
          created_at: string
          error_text: string | null
          finished_at: string | null
          id: string
          input_text: string | null
          langfuse_span_id: string | null
          latency_ms: number | null
          output_text: string | null
          run_id: string
          status: Database["public"]["Enums"]["crew_run_status"]
          step_number: number
          task_id: string | null
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          agent_id?: string | null
          cost_usd?: number
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          input_text?: string | null
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          run_id: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          step_number: number
          task_id?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          agent_id?: string | null
          cost_usd?: number
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          input_text?: string | null
          langfuse_span_id?: string | null
          latency_ms?: number | null
          output_text?: string | null
          run_id?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          step_number?: number
          task_id?: string | null
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "swarm_run_steps_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "swarm_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "swarm_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_run_steps_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "swarm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_runs: {
        Row: {
          created_at: string
          error_text: string | null
          finished_at: string | null
          id: string
          inputs_json: Json
          langfuse_trace_id: string | null
          result_text: string | null
          started_at: string
          status: Database["public"]["Enums"]["crew_run_status"]
          swarm_id: string
          total_cost_usd: number
          total_tokens_in: number
          total_tokens_out: number
          trigger: Database["public"]["Enums"]["crew_trigger"]
        }
        Insert: {
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          inputs_json?: Json
          langfuse_trace_id?: string | null
          result_text?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          swarm_id: string
          total_cost_usd?: number
          total_tokens_in?: number
          total_tokens_out?: number
          trigger: Database["public"]["Enums"]["crew_trigger"]
        }
        Update: {
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          inputs_json?: Json
          langfuse_trace_id?: string | null
          result_text?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["crew_run_status"]
          swarm_id?: string
          total_cost_usd?: number
          total_tokens_in?: number
          total_tokens_out?: number
          trigger?: Database["public"]["Enums"]["crew_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "swarm_runs_swarm_id_fkey"
            columns: ["swarm_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_tasks: {
        Row: {
          agent_id: string | null
          created_at: string
          depends_on_task_id: string | null
          description: string | null
          expected_output: string | null
          id: string
          name: string
          position_x: number
          position_y: number
          swarm_id: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          depends_on_task_id?: string | null
          description?: string | null
          expected_output?: string | null
          id?: string
          name: string
          position_x?: number
          position_y?: number
          swarm_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          depends_on_task_id?: string | null
          description?: string | null
          expected_output?: string | null
          id?: string
          name?: string
          position_x?: number
          position_y?: number
          swarm_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swarm_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "swarm_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_tasks_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "swarm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_tasks_swarm_id_fkey"
            columns: ["swarm_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
        ]
      }
      swarm_tool_bindings: {
        Row: {
          agent_id: string | null
          config_json: Json
          created_at: string
          id: string
          priority: number
          swarm_id: string
          tool_id: string
        }
        Insert: {
          agent_id?: string | null
          config_json?: Json
          created_at?: string
          id?: string
          priority?: number
          swarm_id: string
          tool_id: string
        }
        Update: {
          agent_id?: string | null
          config_json?: Json
          created_at?: string
          id?: string
          priority?: number
          swarm_id?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swarm_tool_bindings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "swarm_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_tool_bindings_swarm_id_fkey"
            columns: ["swarm_id"]
            isOneToOne: false
            referencedRelation: "swarms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swarm_tool_bindings_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      swarms: {
        Row: {
          config_json: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_template: boolean
          name: string
          owner_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          config_json?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          name: string
          owner_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          config_json?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_template?: boolean
          name?: string
          owner_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      tenant_config: {
        Row: {
          created_at: string
          modules: string[]
          owner_id: string
          product: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          modules?: string[]
          owner_id: string
          product?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          modules?: string[]
          owner_id?: string
          product?: string
          updated_at?: string
        }
        Relationships: []
      }
      tools: {
        Row: {
          auth_type: string | null
          category: Database["public"]["Enums"]["tool_category"]
          created_at: string
          description: string | null
          endpoint_url: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          schema_json: Json
          updated_at: string
        }
        Insert: {
          auth_type?: string | null
          category: Database["public"]["Enums"]["tool_category"]
          created_at?: string
          description?: string | null
          endpoint_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          schema_json?: Json
          updated_at?: string
        }
        Update: {
          auth_type?: string | null
          category?: Database["public"]["Enums"]["tool_category"]
          created_at?: string
          description?: string | null
          endpoint_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          schema_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          events: string[]
          id: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          events?: string[]
          id?: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          events?: string[]
          id?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      exec_readonly_sql: { Args: { q: string }; Returns: Json }
      hedge_canonical_json: { Args: { payload: Json }; Returns: string }
      hedge_chain_hash: {
        Args: { payload: Json; prev_hash: string }
        Returns: string
      }
      hedge_current_tenant_id: { Args: never; Returns: string }
      hedge_is_blocked: {
        Args: { p_tenant: string; p_venue: string }
        Returns: boolean
      }
    }
    Enums: {
      agent_role:
        | "coordinator"
        | "analyst"
        | "executor"
        | "reviewer"
        | "tool_runner"
      chief_decision_action: "sent" | "snoozed" | "rejected"
      crew_run_status:
        | "pending"
        | "running"
        | "paused_hitl"
        | "completed"
        | "failed"
        | "cancelled"
      crew_trigger: "morning" | "evening" | "intraday" | "on_demand" | "webhook"
      tool_category:
        | "api_call"
        | "file_io"
        | "code_execution"
        | "search"
        | "database"
        | "custom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

const Constants = {
  public: {
    Enums: {
      agent_role: [
        "coordinator",
        "analyst",
        "executor",
        "reviewer",
        "tool_runner",
      ],
      chief_decision_action: ["sent", "snoozed", "rejected"],
      crew_run_status: [
        "pending",
        "running",
        "paused_hitl",
        "completed",
        "failed",
        "cancelled",
      ],
      crew_trigger: ["morning", "evening", "intraday", "on_demand", "webhook"],
      tool_category: [
        "api_call",
        "file_io",
        "code_execution",
        "search",
        "database",
        "custom",
      ],
    },
  },
} as const
