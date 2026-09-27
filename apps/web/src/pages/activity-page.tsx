import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import type { PageResult } from "@erp/types";
import { api } from "../lib/api-client.js";
import { EmptyState, ErrorState, LoadingState } from "../components/feedback.js";

interface ActivityRecord {
  id: string;
  action: string;
  entityType: string | null;
  createdAt: string;
  userName: string | null;
}

export function ActivityPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const activity = useQuery({
    queryKey: ["company-activity", search, page],
    queryFn: () =>
      api.get<PageResult<ActivityRecord>>(
        `/dashboard/activity?page=${page}&pageSize=25${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
    placeholderData: (previous) => previous,
  });
  return (
    <section className="page-section">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SECURITY & OPERATIONS</p>
          <h1>Activity log</h1>
          <p className="page-description">A company-scoped record of important workspace events.</p>
        </div>
        <span className="status-badge">
          <span className="online-dot" />
          Live log
        </span>
      </div>
      <div className="data-panel">
        <div className="data-toolbar">
          <div>
            <h2>Recorded events</h2>
            <span>{activity.data?.total ?? 0} entries</span>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              type="search"
              placeholder="Filter by action"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              aria-label="Filter activity by action"
            />
          </label>
        </div>
        {activity.isPending ? (
          <LoadingState label="Loading company activity" />
        ) : activity.isError ? (
          <ErrorState message={activity.error.message} onRetry={() => void activity.refetch()} />
        ) : activity.data.items.length === 0 ? (
          <EmptyState
            title="No activity recorded"
            detail="Company events will be recorded here as they happen."
          />
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table activity-table">
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Area</th>
                    <th scope="col">Performed by</th>
                    <th scope="col">Date and time</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="event-name">
                          <span className="event-dot" />
                          {item.action.replace(/[._]/g, " ")}
                        </span>
                      </td>
                      <td className="secondary-cell">{item.entityType ?? "Workspace"}</td>
                      <td>{item.userName ?? "System"}</td>
                      <td className="secondary-cell">
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(item.createdAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span>
                Page {activity.data.page} of {Math.max(activity.data.pageCount, 1)} <i>·</i>{" "}
                {activity.data.total} total
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  <ArrowLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next page"
                  disabled={page >= activity.data.pageCount}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
