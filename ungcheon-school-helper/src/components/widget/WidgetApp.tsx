import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Clock3,
  GripHorizontal,
  LayoutDashboard,
  Pin,
  PinOff,
  RefreshCw,
  Settings2,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useNoticeStore } from "../../stores/noticeStore";
import {
  getSchoolTimetable,
  listCommitteeState,
  listStaffChecklists,
} from "../../services/schoolHub";
import { getSharedNeisSnapshot } from "../../services/sharedNeis";
import {
  listTimetableChanges,
  timetableChangeSummary,
  type TimetableChangeRequest,
} from "../../services/timetableChanges";
import { listPulledLessonsForTeacher } from "../../services/pulledLessons";
import { buildCompositeTeacherDay } from "../../services/teacherTimetableCalendar";
import { loadPersonalTasks } from "../../services/personalOrganizer";
import { isSharedWorkComplete } from "../../services/sharedWorkNotifications";
import { UNGCHEON_PERIOD_PLAN } from "../../services/ungcheonSchedule";
import { getLocalDailyFortune } from "../../services/localFortune";
import {
  drawLocalLuckyCard,
  type LocalLuckyCard,
  type LuckyCardKind,
} from "../../services/localLuckyCard";
import HwatuCardArt from "./HwatuCardArt";
import type { CompositeTeacherDay } from "../../services/teacherTimetableCalendar";

export type WidgetPreset =
  "glass-light" | "solid-light" | "dark-glass" | "school-yellow" | "minimal";
export interface WidgetSettings {
  expanded: boolean;
  pinned: boolean;
  opacity: number;
  preset: WidgetPreset;
  showFortune: boolean;
  showLuckyCard: boolean;
  luckyCardKind: LuckyCardKind;
  showMeal: boolean;
  showPersonalSchedules: boolean;
  showPersonalTasksInEvents: boolean;
  showNeisSchedules: boolean;
  showCommitteeEvents: boolean;
  showWeeklyPlans: boolean;
  showGateDuty: boolean;
  showMealDuty: boolean;
  showCreativeActivities: boolean;
  dense: boolean;
  x?: number;
  y?: number;
}

interface WidgetEvent {
  title: string;
  meta: string;
  kind: string;
}
interface WidgetTaskSummary {
  id: string;
  title: string;
  deadline: string;
  source: "개인 업무" | "배부 업무";
  rank: number;
}
interface WidgetAlertSummary {
  id: string;
  title: string;
  meta: string;
  kind: "notice" | "change";
}
type WidgetOpenPanel = "tasks" | "alerts" | null;
const PRESETS: Array<{ id: WidgetPreset; label: string }> = [
  { id: "glass-light", label: "유리 밝은색" },
  { id: "solid-light", label: "불투명 흰색" },
  { id: "dark-glass", label: "위젯 어두운색" },
  { id: "school-yellow", label: "학교 노랑" },
  { id: "minimal", label: "최소형" },
];

function ymd(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}
function compactDate(value: string) {
  return value.replaceAll("-", "");
}
function minuteOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}
function periodState(index: number, now: Date) {
  const period = UNGCHEON_PERIOD_PLAN[index];
  const [sh, sm] = period.start.split(":").map(Number);
  const [eh, em] = period.end.split(":").map(Number);
  const current = minuteOfDay(now);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (current >= start && current <= end) return "current";
  const next = UNGCHEON_PERIOD_PLAN.findIndex((item) => {
    const [h, m] = item.start.split(":").map(Number);
    return h * 60 + m > current;
  });
  if (next === index) return "next";
  return current > end ? "past" : "future";
}
function nextCountdown(now: Date) {
  const current = minuteOfDay(now);
  const next = UNGCHEON_PERIOD_PLAN.find((item) => {
    const [h, m] = item.start.split(":").map(Number);
    return h * 60 + m > current;
  });
  if (!next) return "";
  const [h, m] = next.start.split(":").map(Number);
  return `${Math.max(0, h * 60 + m - current)}분 뒤`;
}
function deadlineLabel(date: string, today: string) {
  if (!date) return "기한 없음";
  if (date < today) return `기한 초과 · ${date}`;
  if (date === today) return "오늘 마감";
  return `${date} 마감`;
}
function deadlineRank(date: string, today: string) {
  if (!date) return 3;
  if (date < today) return 0;
  if (date === today) return 1;
  return 2;
}
export function isWidgetActionableChange(
  change: TimetableChangeRequest,
  teacherName: string,
  today: string,
) {
  const lastLessonDate =
    [change.originalDate, change.replacementDate]
      .filter(Boolean)
      .sort()
      .at(-1) ?? "";
  return (
    change.status === "pending" &&
    change.targetTeacherName === teacherName &&
    lastLessonDate >= today
  );
}

export default function WidgetApp() {
  const loadConfig = useAppStore((state) => state.loadConfig);
  const config = useAppStore((state) => state.config);
  const auth = useAuthStore();
  const notices = useNoticeStore((state) => state.notices);
  const lastReadId = useNoticeStore((state) => state.lastReadId);
  const fetchNotices = useNoticeStore((state) => state.fetchNotices);
  const [settings, setSettings] = useState<WidgetSettings>({
    expanded: true,
    pinned: true,
    opacity: 0.96,
    preset: "glass-light",
    showFortune: true,
    showLuckyCard: true,
    luckyCardKind: "tarot",
    showMeal: true,
    showPersonalSchedules: true,
    showPersonalTasksInEvents: true,
    showNeisSchedules: true,
    showCommitteeEvents: true,
    showWeeklyPlans: true,
    showGateDuty: true,
    showMealDuty: true,
    showCreativeActivities: true,
    dense: true,
  });
  const shellRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const [day, setDay] = useState<CompositeTeacherDay | null>(null);
  const [events, setEvents] = useState<WidgetEvent[]>([]);
  const [meal, setMeal] = useState<string[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [taskItems, setTaskItems] = useState<WidgetTaskSummary[]>([]);
  const [changeAlerts, setChangeAlerts] = useState<WidgetAlertSummary[]>([]);
  const [openPanel, setOpenPanel] = useState<WidgetOpenPanel>(null);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [firstRunNotice, setFirstRunNotice] = useState(false);
  const [luckyCard, setLuckyCard] = useState<LocalLuckyCard | null>(null);
  const today = ymd(now);

  const applySettings = useCallback(async (patch: Partial<WidgetSettings>) => {
    const next = await window.electron.widgetUpdateSettings(patch);
    setSettings(next);
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      if (!auth.authenticated || !auth.teacherName) return;
      setSyncing(true);
      try {
        const teacher = auth.teacherName;
        const [timetable, changes, snapshot, personal, sharedTasks, committee] =
          await Promise.all([
            getSchoolTimetable(force),
            listTimetableChanges(teacher, "", "", false, force),
            getSharedNeisSnapshot(force),
            loadPersonalTasks(),
            listStaffChecklists(teacher, "", force),
            listCommitteeState(force),
          ]);
        if (timetable)
          setDay(
            buildCompositeTeacherDay(
              timetable,
              teacher,
              today,
              changes,
              listPulledLessonsForTeacher(teacher, today, today),
            ),
          );
        const actionableChanges = changes
          .filter((change) => isWidgetActionableChange(change, teacher, today))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setPendingChanges(actionableChanges.length);
        setChangeAlerts(
          actionableChanges.slice(0, 12).map((change) => ({
            id: `change-${change.id}`,
            title: "수업 변경 승인 요청",
            meta: timetableChangeSummary(change),
            kind: "change" as const,
          })),
        );
        setMeal(
          snapshot?.meals.find((item) => item.date === compactDate(today))
            ?.dishNames ?? [],
        );
        const personalItems: WidgetTaskSummary[] = personal
          .filter((task) => !task.completed && task.kind !== "schedule")
          .map((task) => ({
            id: `personal-${task.id}`,
            title: task.title,
            deadline: task.date,
            source: "개인 업무",
            rank: deadlineRank(task.date, today),
          }));
        const assignedItems: WidgetTaskSummary[] = sharedTasks
          .filter(
            (task) =>
              task.targetNames.includes(teacher) &&
              !isSharedWorkComplete(task, teacher),
          )
          .map((task) => ({
            id: `shared-${task.id}`,
            title: task.title,
            deadline: task.deadline,
            source: "배부 업무",
            rank: deadlineRank(task.deadline, today),
          }));
        const pendingTasks = [...personalItems, ...assignedItems].sort(
          (a, b) =>
            a.rank - b.rank ||
            (a.deadline || "9999").localeCompare(b.deadline || "9999") ||
            a.title.localeCompare(b.title, "ko"),
        );
        setTaskItems(pendingTasks);
        setTaskCount(pendingTasks.length);
        const eventRows: WidgetEvent[] = [
          ...personal
            .filter(
              (task) => task.date === today && task.showOnCalendar !== false,
            )
            .map((task) => ({
              title: task.title,
              meta:
                task.time ?? (task.kind === "task" ? "개인 업무" : "개인 일정"),
              kind:
                task.kind === "task" ? "personal-task" : "personal-schedule",
            })),
          ...(snapshot?.schedules ?? [])
            .filter((item) => item.date === compactDate(today))
            .map((item) => ({
              title: item.eventName,
              meta: "학사일정",
              kind: "school",
            })),
          ...committee.events
            .filter(
              (item) =>
                item.date === today && item.memberNames.includes(teacher),
            )
            .map((item) => ({
              title: item.title || item.committeeName,
              meta: `${item.startTime}${item.location ? ` · ${item.location}` : ""}`,
              kind: "committee",
            })),
        ];
        const [weekly, duty, creative] = await Promise.allSettled([
          window.electron.weeklyPlanGetMonth(
            now.getFullYear(),
            now.getMonth() + 1,
          ),
          window.electron.dutyScheduleGetMonth(
            now.getFullYear(),
            now.getMonth() + 1,
            teacher,
          ),
          window.electron.creativeScheduleGetMonth(
            now.getFullYear(),
            now.getMonth() + 1,
          ),
        ]);
        if (weekly.status === "fulfilled")
          weekly.value.events
            .filter((item) => item.date === today)
            .forEach((item) =>
              eventRows.push({
                title: item.eventName,
                meta: item.department || "주간계획",
                kind: "weekly",
              }),
            );
        if (duty.status === "fulfilled")
          duty.value.events
            .filter((item) => item.date === today)
            .forEach((item) =>
              eventRows.push({
                title: item.title,
                meta: `${item.time}${item.location ? ` · ${item.location}` : ""}`,
                kind: item.kind,
              }),
            );
        if (creative.status === "fulfilled")
          creative.value.events
            .filter((item) => item.date === today)
            .forEach((item) =>
              eventRows.push({
                title: item.title,
                meta: [item.period, item.grades].filter(Boolean).join(" · "),
                kind: "creative",
              }),
            );
        setEvents(eventRows);
        setOffline(false);
      } catch {
        setOffline(true);
      } finally {
        setSyncing(false);
      }
    },
    [auth.authenticated, auth.teacherName, now, today],
  );

  useEffect(() => {
    void (async () => {
      await loadConfig();
      await auth.bootstrap();
      setSettings(await window.electron.widgetGetSettings());
      setAutoLaunch(await window.electron.getAutoLaunch());
      const noticeSeen = await window.electron.configGet(
        "widget.firstRunNoticeSeen",
      );
      if (noticeSeen !== true) setFirstRunNotice(true);
      void fetchNotices();
    })();
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    const sync = window.setInterval(() => void refresh(false), 10 * 60_000);
    const offAuth = window.electron.onAuthChanged(() => void auth.bootstrap());
    const offSettings = window.electron.onWidgetSettingsChanged(setSettings);
    return () => {
      clearInterval(clock);
      clearInterval(sync);
      offAuth();
      offSettings();
    };
  }, []);
  useEffect(() => {
    void refresh(false);
  }, [auth.authenticated, auth.teacherName, today]);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(
        () => void window.electron.widgetFitHeight(shell.scrollHeight),
      );
    };
    const observer = new ResizeObserver(fit);
    observer.observe(shell);
    fit();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    auth.ready,
    auth.authenticated,
    settings.expanded,
    settings.preset,
    settings.showFortune,
    settings.showLuckyCard,
    settings.luckyCardKind,
    settings.showMeal,
    settings.dense,
    showSettings,
    firstRunNotice,
    events.length,
    settings.showPersonalSchedules,
    settings.showPersonalTasksInEvents,
    settings.showNeisSchedules,
    settings.showCommitteeEvents,
    settings.showWeeklyPlans,
    settings.showGateDuty,
    settings.showMealDuty,
    settings.showCreativeActivities,
    meal.length,
    luckyCard?.id,
    openPanel,
    taskItems.length,
    changeAlerts.length,
  ]);

  const fortune = useMemo(
    () =>
      getLocalDailyFortune(auth.teacherName || config.teacherName || "", today),
    [auth.teacherName, config.teacherName, today],
  );
  const noticeAlerts = useMemo<WidgetAlertSummary[]>(
    () =>
      notices
        .filter((item) => item.id > lastReadId)
        .map((item) => ({
          id: `notice-${item.id}`,
          title: item.title,
          meta: [item.date, item.body].filter(Boolean).join(" · "),
          kind: "notice",
        })),
    [notices, lastReadId],
  );
  const alertItems = useMemo(
    () => [...noticeAlerts, ...changeAlerts].slice(0, 20),
    [noticeAlerts, changeAlerts],
  );
  const unread = noticeAlerts.length + pendingChanges;
  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (event.kind === "personal-schedule")
          return settings.showPersonalSchedules;
        if (event.kind === "personal-task")
          return settings.showPersonalTasksInEvents;
        if (event.kind === "school") return settings.showNeisSchedules;
        if (event.kind === "committee") return settings.showCommitteeEvents;
        if (event.kind === "weekly") return settings.showWeeklyPlans;
        if (event.kind === "gate") return settings.showGateDuty;
        if (event.kind === "meal") return settings.showMealDuty;
        if (event.kind === "creative") return settings.showCreativeActivities;
        return true;
      }),
    [
      events,
      settings.showPersonalSchedules,
      settings.showPersonalTasksInEvents,
      settings.showNeisSchedules,
      settings.showCommitteeEvents,
      settings.showWeeklyPlans,
      settings.showGateDuty,
      settings.showMealDuty,
      settings.showCreativeActivities,
    ],
  );
  const countdown = nextCountdown(now);
  const current = day?.lessons.find(
    (_, index) => periodState(index, now) === "current",
  );
  const next = day?.lessons.find(
    (_, index) => periodState(index, now) === "next",
  );
  const changeLuckyKind = (luckyCardKind: LuckyCardKind) => {
    setLuckyCard(null);
    void applySettings({ luckyCardKind });
  };

  if (!auth.ready)
    return <div className="widget-shell widget-loading">위젯 준비 중…</div>;
  if (!auth.authenticated)
    return (
      <div className="widget-shell widget-login">
        <strong>로그인이 필요합니다</strong>
        <span>개인 시간표와 업무는 로그인 후 표시됩니다.</span>
        <button onClick={() => window.electron.widgetOpenMain("dashboard")}>
          업무도우미에서 로그인
        </button>
      </div>
    );

  return (
    <div
      ref={shellRef}
      style={{ height: "auto" }}
      className={`widget-shell preset-${settings.preset} ${settings.expanded ? "is-expanded" : "is-collapsed"} ${settings.dense ? "is-dense" : ""}`}
    >
      <header className="widget-header drag-region">
        <span className="widget-grip">
          <GripHorizontal size={16} />
        </span>
        <div className="widget-identity">
          <i className={offline ? "offline" : "online"} />
          <b>{auth.teacherName} 선생님</b>
          <small>· {format(now, "M월 d일(EEE) HH:mm", { locale: ko })}</small>
        </div>
        <nav className="no-drag">
          <button
            title={settings.pinned ? "항상 위에 표시 해제" : "항상 위에 표시"}
            onClick={() => applySettings({ pinned: !settings.pinned })}
          >
            {settings.pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button
            title="설정"
            onClick={() => setShowSettings((value) => !value)}
          >
            <Settings2 size={15} />
          </button>
          <button
            title={settings.expanded ? "접기" : "펼치기"}
            onClick={() => applySettings({ expanded: !settings.expanded })}
          >
            {settings.expanded ? (
              <ChevronUp size={16} />
            ) : (
              <ChevronDown size={16} />
            )}
          </button>
          <button
            title="위젯 숨기기"
            onClick={() => window.electron.hideWidget()}
          >
            <X size={16} />
          </button>
        </nav>
      </header>

      {showSettings && (
        <section className="widget-settings no-drag">
          <label>
            디자인
            <select
              value={settings.preset}
              onChange={(event) =>
                applySettings({ preset: event.target.value as WidgetPreset })
              }
            >
              {PRESETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            투명도{" "}
            <input
              type="range"
              min="65"
              max="100"
              value={Math.round(settings.opacity * 100)}
              onChange={(event) =>
                applySettings({ opacity: Number(event.target.value) / 100 })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={autoLaunch}
              onChange={async (event) => {
                setAutoLaunch(event.target.checked);
                await window.electron.setAutoLaunch(event.target.checked);
              }}
            />{" "}
            Windows 시작 시 위젯 자동 실행
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.dense}
              onChange={(event) =>
                applySettings({ dense: event.target.checked })
              }
            />{" "}
            촘촘하게 보기
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.showMeal}
              onChange={(event) =>
                applySettings({ showMeal: event.target.checked })
              }
            />{" "}
            오늘 급식 표시
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.showFortune}
              onChange={(event) =>
                applySettings({ showFortune: event.target.checked })
              }
            />{" "}
            오늘의 운세 표시
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.showLuckyCard}
              onChange={(event) =>
                applySettings({ showLuckyCard: event.target.checked })
              }
            />{" "}
            오늘의 행운카드 표시
          </label>
          <div className="widget-event-filters">
            <strong>오늘 주요 일정 표시</strong>
            {[
              ["showPersonalSchedules", "개인 일정"],
              ["showPersonalTasksInEvents", "개인 업무"],
              ["showNeisSchedules", "NEIS 학사일정"],
              ["showCommitteeEvents", "내 위원회"],
              ["showWeeklyPlans", "주간업무계획"],
              ["showGateDuty", "등교지도"],
              ["showMealDuty", "급식지도"],
              ["showCreativeActivities", "창체"],
            ].map(([key, label]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(settings[key as keyof WidgetSettings])}
                  onChange={(event) =>
                    applySettings({ [key]: event.target.checked })
                  }
                />{" "}
                {label}
              </label>
            ))}
            <small>
              대시보드 달력의 체크박스와 별도로 이 위젯에만 저장됩니다.
            </small>
          </div>
          {settings.showLuckyCard && (
            <label>
              행운카드 종류
              <select
                value={settings.luckyCardKind}
                onChange={(event) =>
                  changeLuckyKind(event.target.value as LuckyCardKind)
                }
              >
                <option value="tarot">타로</option>
                <option value="hwatu">화투</option>
              </select>
            </label>
          )}
        </section>
      )}
      {firstRunNotice && (
        <div className="no-drag flex items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-3 py-2 text-[9px] font-extrabold text-amber-950">
          <span>PC를 켜면 미니 위젯도 자동으로 시작됩니다.</span>
          <button
            className="rounded-md border border-amber-400 bg-white px-2 py-1 text-[9px] font-bold text-amber-950"
            onClick={async () => {
              await window.electron.configSet(
                "widget.firstRunNoticeSeen",
                true,
              );
              setFirstRunNotice(false);
            }}
          >
            확인
          </button>
        </div>
      )}

      {!settings.expanded ? (
        <section className="widget-compact">
          <div>
            <span>현재</span>
            <b>{current?.value.replace("\n", " · ") || "수업 없음"}</b>
          </div>
          <div>
            <span>다음 {countdown}</span>
            <b>{next?.value.replace("\n", " · ") || "일정 없음"}</b>
          </div>
          <div className="compact-counts">
            <span>
              <BriefcaseBusiness size={13} /> {taskCount}
            </span>
            <span>
              <Bell size={13} /> {unread}
            </span>
          </div>
        </section>
      ) : (
        <main>
          <section className="widget-section timetable-section">
            <div className="section-title">
              <span>
                <Clock3 size={15} /> 오늘 시간표
              </span>
              <button title="새로고침" onClick={() => refresh(true)}>
                <RefreshCw size={14} className={syncing ? "spin" : ""} />
              </button>
            </div>
            {day?.rule.label && (
              <div className="day-rule">{day.rule.label}</div>
            )}
            <div className="period-list">
              {(day?.lessons ?? []).slice(0, 7).map((lesson, index) => {
                const state = periodState(index, now);
                return (
                  <div key={lesson.period} className={`period-row ${state}`}>
                    <span className="period-number">{lesson.period}</span>
                    <span className="period-time">
                      {UNGCHEON_PERIOD_PLAN[index].start}
                    </span>
                    <b>
                      {lesson.value
                        ? lesson.value.replace("\n", " · ")
                        : "공강"}
                    </b>
                    {lesson.badge && <em>{lesson.badge}</em>}
                    {state === "current" && <small>현재</small>}
                    {state === "next" && <small>{countdown}</small>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="widget-section events-section">
            <div className="section-title">
              <span>오늘 주요 일정</span>
              <button
                onClick={() => window.electron.widgetOpenMain("calendar")}
              >
                전체 보기
              </button>
            </div>
            {filteredEvents.length ? (
              <ul>
                {filteredEvents.slice(0, 3).map((event, index) => (
                  <li key={`${event.title}-${index}`}>
                    <i data-kind={event.kind} />
                    <div>
                      <b>{event.title}</b>
                      <small>{event.meta}</small>
                    </div>
                  </li>
                ))}
                {filteredEvents.length > 3 && (
                  <li className="more-events">
                    +{filteredEvents.length - 3}개 일정 더보기
                  </li>
                )}
              </ul>
            ) : (
              <p className="empty">등록된 주요 일정이 없습니다.</p>
            )}
          </section>

          {settings.showMeal && (
            <section
              className="widget-section meal-section"
              title={meal.join(" · ")}
            >
              <div className="section-title">
                <span>
                  <Utensils size={15} /> 오늘 급식
                </span>
              </div>
              <p>
                {meal.length
                  ? meal.join(" · ")
                  : "급식 정보를 준비하고 있습니다."}
              </p>
            </section>
          )}
          {settings.showFortune && (
            <section className="widget-section fortune-section">
              <div className="fortune-heading">오늘의 운세</div>
              <p>{fortune.phrase}</p>
              <div>
                <span
                  className="color-dot"
                  style={{ background: fortune.colorHex }}
                />{" "}
                행운의 색 <b>{fortune.colorName}</b>
                <span className="fortune-number">
                  행운의 숫자 <b>{fortune.luckyNumber}</b>
                </span>
              </div>
            </section>
          )}
          {settings.showLuckyCard && (
            <section className="widget-section lucky-card-section">
              <div className="section-title">
                <span>
                  <Sparkles size={14} /> 오늘의 행운카드
                </span>
                <span className="lucky-kind-switch" aria-label="행운카드 종류">
                  <button
                    className={
                      settings.luckyCardKind === "tarot" ? "active" : ""
                    }
                    onClick={() => changeLuckyKind("tarot")}
                  >
                    타로
                  </button>
                  <button
                    className={
                      settings.luckyCardKind === "hwatu" ? "active" : ""
                    }
                    onClick={() => changeLuckyKind("hwatu")}
                  >
                    화투
                  </button>
                </span>
              </div>
              {!luckyCard ? (
                <div className="lucky-card-prompt">
                  <p>궁금한 내용을 머릿속으로 떠올리며 클릭해주세요</p>
                  <button
                    onClick={() =>
                      setLuckyCard(drawLocalLuckyCard(settings.luckyCardKind))
                    }
                  >
                    <span className="card-back">✦</span> 카드 뽑기
                  </button>
                </div>
              ) : (
                <div className="lucky-card-result">
                  <div
                    className={`lucky-card-art ${luckyCard.kind}`}
                    style={
                      {
                        "--card-accent": luckyCard.colorHex,
                      } as React.CSSProperties
                    }
                  >
                    {luckyCard.kind === "hwatu" ? (
                      <HwatuCardArt
                        cardId={luckyCard.id}
                        name={luckyCard.name}
                      />
                    ) : (
                      <>
                        <span>{luckyCard.symbol}</span>
                        <small>{luckyCard.subtitle}</small>
                      </>
                    )}
                  </div>
                  <div className="lucky-card-copy">
                    <b>{luckyCard.name}</b>
                    <p>{luckyCard.message}</p>
                    <dl>
                      <div>
                        <dt>업무</dt>
                        <dd>{luckyCard.work}</dd>
                      </div>
                      <div>
                        <dt>관계</dt>
                        <dd>{luckyCard.relationship}</dd>
                      </div>
                      <div>
                        <dt>한마디</dt>
                        <dd>{luckyCard.advice}</dd>
                      </div>
                    </dl>
                    <div className="lucky-card-luck">
                      <span
                        className="color-dot"
                        style={{ background: luckyCard.colorHex }}
                      />{" "}
                      {luckyCard.colorName}
                      <b>{luckyCard.luckyNumber}</b>
                    </div>
                  </div>
                  <div className="lucky-card-controls">
                    <button
                      className="lucky-card-redraw"
                      onClick={() =>
                        setLuckyCard(
                          drawLocalLuckyCard(
                            settings.luckyCardKind,
                            luckyCard.id,
                          ),
                        )
                      }
                    >
                      다시 뽑기
                    </button>
                    <button
                      className="lucky-card-close"
                      onClick={() => setLuckyCard(null)}
                    >
                      카드 닫기
                    </button>
                  </div>
                </div>
              )}
              <small className="lucky-card-note">
                외부 전송 없이 이 PC에서 무작위로 뽑는 긍정 메시지입니다.
              </small>
            </section>
          )}
          {openPanel && (
            <section
              className="widget-popover no-drag"
              aria-label={
                openPanel === "tasks" ? "미완료 업무 요약" : "새 알림 요약"
              }
            >
              <div className="widget-popover-heading">
                <b>{openPanel === "tasks" ? "미완료 업무" : "새 알림"}</b>
                <button title="닫기" onClick={() => setOpenPanel(null)}>
                  <X size={14} />
                </button>
              </div>
              <div className="widget-popover-list">
                {openPanel === "tasks"
                  ? taskItems.slice(0, 5).map((item) => (
                      <div className="widget-popover-row" key={item.id}>
                        <span className="widget-source">{item.source}</span>
                        <div>
                          <b>{item.title}</b>
                          <small>{deadlineLabel(item.deadline, today)}</small>
                        </div>
                      </div>
                    ))
                  : alertItems.slice(0, 5).map((item) => (
                      <div className="widget-popover-row" key={item.id}>
                        <span className={`widget-source ${item.kind}`}>
                          {item.kind === "notice" ? "공지" : "수업"}
                        </span>
                        <div>
                          <b>{item.title}</b>
                          <small>{item.meta}</small>
                        </div>
                      </div>
                    ))}
                {(openPanel === "tasks"
                  ? taskItems.length
                  : alertItems.length) === 0 && (
                  <p className="empty">표시할 내용이 없습니다.</p>
                )}
              </div>
              {(openPanel === "tasks" ? taskItems.length : alertItems.length) >
                5 && (
                <small className="widget-popover-more">
                  외{" "}
                  {(openPanel === "tasks"
                    ? taskItems.length
                    : alertItems.length) - 5}
                  건
                </small>
              )}
              <button
                className="widget-popover-open"
                onClick={() =>
                  window.electron.widgetOpenMain(
                    openPanel === "tasks" ? "staff_tasks" : "dashboard",
                  )
                }
              >
                {openPanel === "tasks"
                  ? "업무센터에서 전체 보기"
                  : "알림 전체 보기"}
              </button>
            </section>
          )}
          <section className="widget-actions">
            <button
              className={openPanel === "tasks" ? "active" : ""}
              onClick={() =>
                setOpenPanel((value) => (value === "tasks" ? null : "tasks"))
              }
            >
              <BriefcaseBusiness size={15} />
              <span>미완료 업무</span>
              <b>{taskCount}</b>
            </button>
            <button
              className={openPanel === "alerts" ? "active" : ""}
              onClick={() =>
                setOpenPanel((value) => (value === "alerts" ? null : "alerts"))
              }
            >
              <Bell size={15} />
              <span>새 알림</span>
              <b>{unread}</b>
            </button>
            <button
              className="open-main"
              onClick={() => window.electron.widgetOpenMain("dashboard")}
            >
              <LayoutDashboard size={15} /> 프로그램 열기
            </button>
          </section>
        </main>
      )}
    </div>
  );
}
