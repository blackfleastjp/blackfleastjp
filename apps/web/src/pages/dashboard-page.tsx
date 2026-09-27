import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BriefcaseBusiness,
  CircleDollarSign,
  Clock3,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardSummary } from "@erp/types";
import { api } from "../lib/api-client.js";
import { exportTablePdf } from "../lib/file-processing.js";
import { useUiStore } from "../state/ui-store.js";
import { EmptyState, ErrorState, LoadingState } from "../components/feedback.js";

function humanizeAction(value: string): string {
  return value.replace(/[._]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function DashboardPage() {
  const companyId = useUiStore((state) => state.selectedCompanyId);
  const summary = useQuery({
    queryKey: ["dashboard", companyId],
    queryFn: () => api.get<DashboardSummary>("/dashboard/summary"),
    enabled: Boolean(companyId),
  });
  if (summary.isPending) return <LoadingState label="Loading your company overview" />;
  if (summary.isError)
    return <ErrorState message={summary.error.message} onRetry={() => void summary.refetch()} />;
  const data = summary.data;
  const activityTotal = data.activity.reduce((total, day) => total + day.events, 0);

  return (
    <section className="page-section dashboard-page">
      <div className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">MONDAY, AT A GLANCE</p>
          <h1>Good work starts with a clear view.</h1>
          <p className="page-description">Your team and operations, together in one place.</p>
        </div>
        <button
          className="button button-secondary export-button"
          onClick={() =>
            void exportTablePdf(
              "Company activity overview",
              ["Date", "Events"],
              data.activity.map((day) => [day.date, String(day.events)]),
            )
          }
        >
          <ArrowDownToLine size={16} />
          Export report
        </button>
      </div>
      <div className="welcome-strip">
        <div className="welcome-mark">
          <BriefcaseBusiness size={20} />
        </div>
        <div>
          <span>ACTIVE WORKSPACE</span>
          <strong>{data.company.name}</strong>
        </div>
        <span className="welcome-meta">
          {new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(
            new Date(),
          )}
        </span>
        <div className="welcome-decoration" aria-hidden="true">
          L
        </div>
      </div>
      <div className="metric-grid">
        <article className="metric-tile metric-featured">
          <div className="metric-top">
            <span>Active people</span>
            <span className="metric-icon">
              <Users size={17} />
            </span>
          </div>
          <strong className="metric-value">{data.activeUsers.toLocaleString()}</strong>
          <span className="metric-caption">Across this company</span>
          <div className="metric-trend">
            <span>●</span> Current membership
          </div>
        </article>
        <article className="metric-tile">
          <div className="metric-top">
            <span>Recorded activity</span>
            <span className="metric-icon metric-icon-orange">
              <Clock3 size={17} />
            </span>
          </div>
          <strong className="metric-value">{activityTotal.toLocaleString()}</strong>
          <span className="metric-caption">Audit events in 30 days</span>
          <div className="metric-trend metric-trend-muted">From your company log</div>
        </article>
        <article className="metric-tile metric-open">
          <div className="metric-top">
            <span>Reporting currency</span>
            <span className="metric-icon metric-icon-sage">
              <CircleDollarSign size={18} />
            </span>
          </div>
          <strong className="metric-value metric-currency">{data.company.currency}</strong>
          <span className="metric-caption">Company default currency</span>
          <div className="metric-trend metric-trend-muted">Set by your administrator</div>
        </article>
      </div>
      <div className="dashboard-grid">
        <section className="report-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">THE LAST 30 DAYS</p>
              <h2>Workspace activity</h2>
            </div>
            <span className="report-total">
              <ArrowUpRight size={15} />
              {activityTotal.toLocaleString()} events
            </span>
          </div>
          {activityTotal === 0 ? (
            <EmptyState
              title="A quiet start"
              detail="Company events will appear here as your team uses the workspace."
            />
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart
                  data={data.activity}
                  margin={{ top: 8, right: 10, left: -22, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#567b64" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#567b64" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#e7e9e5" strokeDasharray="3 5" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date: string) =>
                      new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })
                    }
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                    tick={{ fill: "#8a928d", fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#8a928d", fontSize: 11 }}
                  />
                  <Tooltip
                    labelFormatter={(date) =>
                      new Date(`${String(date)}T00:00:00Z`).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        timeZone: "UTC",
                      })
                    }
                    contentStyle={{ border: "1px solid #e1e5e0", borderRadius: 4, fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="events"
                    stroke="#547861"
                    strokeWidth={2}
                    fill="url(#activityFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="activity-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LATEST UPDATES</p>
              <h2>Recent activity</h2>
            </div>
            <span className="activity-count">
              {data.recentActivity.length.toString().padStart(2, "0")}
            </span>
          </div>
          {data.recentActivity.length === 0 ? (
            <EmptyState
              title="Nothing to report yet"
              detail="Security-sensitive changes will be listed here."
            />
          ) : (
            <ol className="activity-list">
              {data.recentActivity.map((item, index) => (
                <li key={item.id}>
                  <span
                    className={`activity-marker ${index === 0 ? "activity-marker-current" : ""}`}
                  />
                  <div className="activity-entry">
                    <strong>{humanizeAction(item.action)}</strong>
                    <span>{item.userName ?? "System"}</span>
                  </div>
                  <time dateTime={item.createdAt}>
                    {new Intl.DateTimeFormat(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(item.createdAt))}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <div className="dashboard-note">
        <span className="note-mark">i</span>
        <span>
          Financial summaries appear when accounting modules are connected. No amounts are estimated
          or inferred.
        </span>
        <span className="note-currency">{data.company.currency}</span>
      </div>
    </section>
  );
}
