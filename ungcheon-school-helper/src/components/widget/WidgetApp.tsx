import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  GripHorizontal,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  Pin,
  PinOff,
  RefreshCw,
  SearchCheck,
  Settings2,
  ShieldCheck,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import QRCode from "qrcode";
import { useAppStore } from "../../stores/appStore";
import { useAuthStore } from "../../stores/authStore";
import { useNoticeStore } from "../../stores/noticeStore";
import {
  getSchoolTimetable,
  listCommitteeState,
  listStaffChecklists,
  type CommitteeState,
} from "../../services/schoolHub";
import { getSharedNeisSnapshot } from "../../services/sharedNeis";
import {
  listTimetableChanges,
  timetableChangeSummary,
  type TimetableChangeRequest,
} from "../../services/timetableChanges";
import { listPulledLessonsForTeacher } from "../../services/pulledLessons";
import {
  buildCompositeTeacherDay,
  getAcademicDayRule,
  type CompositeTeacherDay,
} from "../../services/teacherTimetableCalendar";
import {
  createPersonalTaskId,
  loadPersonalTasks,
  savePersonalTasks,
  type PersonalTask,
} from "../../services/personalOrganizer";
import { isSharedWorkComplete } from "../../services/sharedWorkNotifications";
import { UNGCHEON_PERIOD_PLAN } from "../../services/ungcheonSchedule";
import WidgetTimetable from "./WidgetTimetable";
import { buildWidgetBaseEvents, buildWidgetSupplementEvents, normalizeWidgetEventDate, type WidgetEvent } from "../../services/widgetEventSources";
import { normalizeWidgetTimedEvents } from "../../services/widgetTimedSchedule";
import { getLocalDailyFortune } from "../../services/localFortune";
import {
  drawLocalLuckyCard,
  type LocalLuckyCard,
  type LuckyCardKind,
} from "../../services/localLuckyCard";
import {
  DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS,
  WIDGET_MODULE_IDS,
  isWidgetModuleVisible,
  normalizeWidgetProductivitySettings,
  type WidgetModuleId,
  type WidgetProductivitySettings,
} from "../../services/widgetSettings";
import {
  addDaysYmd,
  buildTaskBuckets,
  buildWeatherActions,
  getWidgetPeriodTiming,
  resolveTomorrowPreviewDay,
  shouldShowTomorrowPreview,
  type WidgetPeriodTiming,
} from "../../services/widgetViewModel";
import {
  addWidgetQuickMemo,
  addWidgetQuickSnippet,
  loadWidgetQuickMemos,
  loadWidgetQuickSnippets,
  quickMemoToPersonalTaskDraft,
  removeWidgetQuickMemo,
  removeWidgetQuickSnippet,
  toggleWidgetQuickMemo,
  updateWidgetQuickMemo,
  type QuickMemo,
  type QuickMemoRetention,
  type QuickSnippet,
  type WidgetLocalConfigAdapter,
} from "../../services/widgetLocalData";
import { useWeather } from "../useWeather";
import HwatuCardArt from "./HwatuCardArt";
import WidgetSettingsPanel, {
  type WidgetShortcutOption,
} from "./WidgetSettingsPanel";
import WidgetQuickMemo from "./WidgetQuickMemo";
import WidgetQuickTools from "./WidgetQuickTools";
import {
  WidgetEndOfDayModule,
  WidgetPeriodTimerModule,
  WidgetShortcutsModule,
  WidgetTaskTimelineModule,
  WidgetTomorrowModule,
  WidgetWeatherModule,
  type WidgetPeriodTimerView,
  type WidgetTomorrowPreviewView,
} from "./WidgetProductivityModules";

export type WidgetPreset =
  | "glass-light"
  | "solid-light"
  | "dark-glass"
  | "school-yellow"
  | "minimal";

export interface WidgetSettings extends WidgetProductivitySettings {
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

interface WidgetTaskSummary {
  id: string;
  title: string;
  deadline: string;
  source: "개인 업무" | "배부 업무";
  completed: boolean;
  rank: number;
}

interface WidgetAlertSummary {
  id: string;
  title: string;
  meta: string;
  kind: "notice" | "change";
}

interface TomorrowState {
  date: string;
  continued: boolean;
  day: CompositeTeacherDay | null;
  firstEvent: WidgetEvent | null;
  duties: WidgetEvent[];
  tomorrowRuleLabel: string;
}

interface DateSupplement {
  events: WidgetEvent[];
  duties: WidgetEvent[];
  failed: boolean;
}

interface BriefingDisplayState {
  date: string;
  dismissed: boolean;
  snoozedUntil: string;
}

type WidgetOpenPanel = "tasks" | "alerts" | null;

const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  ...DEFAULT_WIDGET_PRODUCTIVITY_SETTINGS,
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
};

const PRESETS: Array<{ id: WidgetPreset; label: string }> = [
  { id: "glass-light", label: "유리 밝은색" },
  { id: "solid-light", label: "불투명 흰색" },
  { id: "school-yellow", label: "학교 노랑" },
  { id: "minimal", label: "최소형" },
];

const SHORTCUT_OPTIONS: readonly WidgetShortcutOption[] = [
  { id: "calendar", label: "캘린더", icon: <CalendarDays size={12} /> },
  { id: "timetable_swap", label: "교사 시간표", icon: <Clock3 size={12} /> },
  { id: "student_locator", label: "학생 위치", icon: <SearchCheck size={12} /> },
  { id: "staff_tasks", label: "업무센터", icon: <ClipboardCheck size={12} /> },
  { id: "volunteer_work", label: "봉사활동", icon: <HeartHandshake size={12} /> },
  { id: "committees", label: "위원회", icon: <Landmark size={12} /> },
  { id: "audit_evidence", label: "감사 증빙", icon: <ShieldCheck size={12} /> },
  { id: "dashboard", label: "대시보드", icon: <LayoutDashboard size={12} /> },
];

function normalizeWidgetSettings(value: unknown): WidgetSettings {
  const raw = value && typeof value === "object"
    ? value as Partial<WidgetSettings>
    : {};
  const productivity = normalizeWidgetProductivitySettings(raw);
  return {
    ...DEFAULT_WIDGET_SETTINGS,
    ...raw,
    ...productivity,
    // Dark mode was retired. Existing PCs that saved the old preset migrate
    // to the readable bright glass design without losing other settings.
    preset: raw.preset === "dark-glass"
      ? "glass-light"
      : raw.preset ?? DEFAULT_WIDGET_SETTINGS.preset,
  };
}

function ymd(date = new Date()) {
  return format(date, "yyyy-MM-dd");
}

function minuteOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function clockMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
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

function sortWidgetEvents(rows: WidgetEvent[]) {
  return [...rows].sort((left, right) =>
    (left.time || "99:99").localeCompare(right.time || "99:99")
      || left.title.localeCompare(right.title, "ko"));
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return format(parsed, "M월 d일(EEE)", { locale: ko });
}

function targetPreviewDate(today: string, continueToNextInstructionDay: boolean) {
  const days = Array.from({ length: 22 }, (_, index) => {
    const date = addDaysYmd(today, index + 1);
    const rule = getAcademicDayRule(date);
    return { date, kind: rule.kind, label: rule.label || "수업일" };
  });
  return resolveTomorrowPreviewDay(today, days, continueToNextInstructionDay);
}

function actualTimerView(
  day: CompositeTeacherDay | null,
  now: Date,
): WidgetPeriodTimerView {
  const base = getWidgetPeriodTiming(now);
  if (!day || day.rule.kind !== "instruction") {
    return {
      ...base,
      phase: "after-school",
      currentPeriod: null,
      nextPeriod: null,
      remainingMinutes: null,
      label: day?.rule.label || "수업일이 아닙니다",
      detail: "오늘 적용할 교사 시간표가 없습니다.",
      headline: day?.rule.label || "수업 없음",
    };
  }

  const currentLesson = base.currentPeriod
    ? day.lessons[base.currentPeriod - 1]
    : null;
  if (currentLesson?.value) {
    const period = UNGCHEON_PERIOD_PLAN[currentLesson.period - 1];
    const start = clockMinutes(period.start);
    const end = clockMinutes(period.end);
    const progress = ((minuteOfDay(now) - start) / Math.max(1, end - start)) * 100;
    return {
      ...base,
      headline: `${currentLesson.period}교시 · ${currentLesson.value.replace("\n", " · ")}`,
      detail: [currentLesson.badge, `${period.end} 종료`].filter(Boolean).join(" · "),
      countdown: `${base.remainingMinutes ?? 0}분 남음`,
      progress,
    };
  }

  const currentOrCompleted = base.currentPeriod ?? base.completedPeriod ?? 0;
  const nextLesson = day.lessons.find(
    lesson => lesson.period > currentOrCompleted && Boolean(lesson.value),
  );
  if (!nextLesson) {
    return {
      ...base,
      phase: "after-school",
      currentPeriod: null,
      nextPeriod: null,
      remainingMinutes: null,
      label: "오늘 수업 종료",
      detail: "남은 정규 수업이 없습니다.",
      headline: "오늘 수업 종료",
    };
  }

  const nextPeriod = UNGCHEON_PERIOD_PLAN[nextLesson.period - 1];
  const remaining = Math.max(0, Math.ceil(clockMinutes(nextPeriod.start) - minuteOfDay(now)));
  const phase: WidgetPeriodTiming["phase"] = base.phase === "lunch" ? "lunch" : "break";
  return {
    ...base,
    phase,
    currentPeriod: null,
    nextPeriod: nextLesson.period,
    remainingMinutes: remaining,
    label: base.currentPeriod ? `${base.currentPeriod}교시 공강` : base.label,
    detail: `${nextLesson.period}교시 ${nextPeriod.start} 시작`,
    headline: `${nextLesson.period}교시 · ${nextLesson.value.replace("\n", " · ")}`,
    countdown: `${remaining}분 뒤`,
  };
}

async function loadDateSupplement(
  date: string,
  teacherName: string,
  force: boolean,
): Promise<DateSupplement> {
  const [year, month] = date.split("-").map(Number);
  const [weekly, duty, creative] = await Promise.allSettled([
    window.electron.weeklyPlanGetMonth(year, month, force),
    window.electron.dutyScheduleGetMonth(year, month, teacherName, force),
    window.electron.creativeScheduleGetMonth(year, month, force),
  ]);
  const events = buildWidgetSupplementEvents(date, {
    weekly: weekly.status === "fulfilled" ? weekly.value.events : [],
    duty: duty.status === "fulfilled" ? duty.value.events : [],
    creative: creative.status === "fulfilled" ? creative.value.events : [],
  });
  const duties = events.filter(event => event.kind === "gate" || event.kind === "meal");
  return {
    events,
    duties,
    failed: [weekly, duty, creative].some(result => result.status === "rejected"),
  };
}

export function isWidgetActionableChange(
  change: TimetableChangeRequest,
  teacherName: string,
  today: string,
) {
  const lastLessonDate = [change.originalDate, change.replacementDate]
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
  return change.status === "pending"
    && change.targetTeacherName === teacherName
    && lastLessonDate >= today;
}

export default function WidgetApp() {
  const loadConfig = useAppStore(state => state.loadConfig);
  const config = useAppStore(state => state.config);
  const auth = useAuthStore();
  const notices = useNoticeStore(state => state.notices);
  const lastReadId = useNoticeStore(state => state.lastReadId);
  const fetchNotices = useNoticeStore(state => state.fetchNotices);
  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const remoteGenerationRef = useRef(0);
  const localGenerationRef = useRef(0);
  const activeTeacherRef = useRef(auth.teacherName);
  activeTeacherRef.current = auth.teacherName;
  const [now, setNow] = useState(new Date());
  const [day, setDay] = useState<CompositeTeacherDay | null>(null);
  const [tomorrow, setTomorrow] = useState<TomorrowState>({
    date: addDaysYmd(ymd(), 1),
    continued: false,
    day: null,
    firstEvent: null,
    duties: [],
    tomorrowRuleLabel: "",
  });
  const [events, setEvents] = useState<WidgetEvent[]>([]);
  const [meal, setMeal] = useState<string[]>([]);
  const [taskItems, setTaskItems] = useState<WidgetTaskSummary[]>([]);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [changeAlerts, setChangeAlerts] = useState<WidgetAlertSummary[]>([]);
  const [openPanel, setOpenPanel] = useState<WidgetOpenPanel>(null);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [timetableUnavailable, setTimetableUnavailable] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [firstRunNotice, setFirstRunNotice] = useState(false);
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([]);
  const [luckyCard, setLuckyCard] = useState<LocalLuckyCard | null>(null);
  const [memos, setMemos] = useState<QuickMemo[]>([]);
  const [snippets, setSnippets] = useState<QuickSnippet[]>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const [briefingDisplay, setBriefingDisplay] = useState<BriefingDisplayState>({
    date: "",
    dismissed: false,
    snoozedUntil: "",
  });
  const [dataOwner, setDataOwner] = useState("");
  const today = ymd(now);
  const weather = useWeather(config.schoolAddress);
  const widgetLocalAdapter = useMemo<WidgetLocalConfigAdapter>(() => {
    const userKey = encodeURIComponent(auth.teacherName || "로그인전");
    const scopedKey = (key: string) => `widget.productivity.user.${userKey}.${key}`;
    return {
      get: key => window.electron.configGet(scopedKey(key)),
      set: (key, value) => window.electron.configSet(scopedKey(key), value),
    };
  }, [auth.teacherName]);

  const applySettings = useCallback(async (patch: Partial<WidgetSettings>) => {
    const next = await window.electron.widgetUpdateSettings(patch);
    setSettings(normalizeWidgetSettings(next));
  }, []);

  const refreshLocal = useCallback(async () => {
    const generation = ++localGenerationRef.current;
    const teacher = auth.teacherName;
    const [nextMemos, nextSnippets] = await Promise.all([
      loadWidgetQuickMemos(widgetLocalAdapter, ymd()),
      loadWidgetQuickSnippets(widgetLocalAdapter),
    ]);
    if (generation !== localGenerationRef.current || teacher !== activeTeacherRef.current) return;
    setMemos(nextMemos);
    setSnippets(nextSnippets);
  }, [auth.teacherName, widgetLocalAdapter]);

  const refresh = useCallback(async (force = false) => {
    if (!auth.authenticated || !auth.teacherName) return;
    const refreshNow = new Date();
    const currentToday = ymd(refreshNow);
    const previewTarget = targetPreviewDate(
      currentToday,
      settings.continueToNextInstructionDay,
    );
    const targetDate = previewTarget.target.date;
    const teacher = auth.teacherName;
    const generation = ++remoteGenerationRef.current;
    setSyncing(true);

    try {
      const [
        timetableResult,
        changesResult,
        snapshotResult,
        personalResult,
        sharedTasksResult,
        committeeResult,
        supplementsResult,
      ] = await Promise.all([
        Promise.allSettled([getSchoolTimetable(force)]).then(result => result[0]),
        Promise.allSettled([
          listTimetableChanges(teacher, "", "", false, force),
        ]).then(result => result[0]),
        Promise.allSettled([getSharedNeisSnapshot(force)]).then(result => result[0]),
        Promise.allSettled([loadPersonalTasks()]).then(result => result[0]),
        Promise.allSettled([listStaffChecklists(teacher, "", force)]).then(result => result[0]),
        Promise.allSettled([listCommitteeState(force)]).then(result => result[0]),
        Promise.allSettled([
          Promise.all([
            loadDateSupplement(currentToday, teacher, force),
            targetDate === currentToday
              ? Promise.resolve<DateSupplement>({ events: [], duties: [], failed: false })
              : loadDateSupplement(targetDate, teacher, force),
          ]),
        ]).then(result => result[0]),
      ]);

      if (generation !== remoteGenerationRef.current || teacher !== activeTeacherRef.current) return;

      const timetable = timetableResult.status === "fulfilled"
        ? timetableResult.value
        : null;
      setTimetableUnavailable(timetableResult.status === "rejected" || !timetable);
      const changes = changesResult.status === "fulfilled"
        ? changesResult.value
        : [];
      const snapshot = snapshotResult.status === "fulfilled"
        ? snapshotResult.value
        : null;
      const personal = personalResult.status === "fulfilled"
        ? personalResult.value
        : [];
      const sharedTasks = sharedTasksResult.status === "fulfilled"
        ? sharedTasksResult.value
        : [];
      const committee: CommitteeState = committeeResult.status === "fulfilled"
        ? committeeResult.value
        : { assignments: [], events: [] };
      const [todaySupplement, targetSupplement] = supplementsResult.status === "fulfilled"
        ? supplementsResult.value
        : [
          { events: [], duties: [], failed: true },
          { events: [], duties: [], failed: true },
        ];

      if (timetable) {
        setDay(buildCompositeTeacherDay(
          timetable,
          teacher,
          currentToday,
          changes,
          listPulledLessonsForTeacher(teacher, currentToday, currentToday),
        ));
      } else setDay(null);

      const targetDay = timetable
        ? buildCompositeTeacherDay(
          timetable,
          teacher,
          targetDate,
          changes,
          listPulledLessonsForTeacher(teacher, targetDate, targetDate),
        )
        : null;

      if (changesResult.status === "fulfilled") {
        const actionableChanges = changes
          .filter(change => isWidgetActionableChange(change, teacher, currentToday))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setPendingChanges(actionableChanges.length);
        setChangeAlerts(actionableChanges.slice(0, 12).map(change => ({
          id: `change-${change.id}`,
          title: "수업 변경 승인 요청",
          meta: timetableChangeSummary(change),
          kind: "change" as const,
        })));
      } else {
        setPendingChanges(0);
        setChangeAlerts([]);
      }

      if (snapshotResult.status === "fulfilled") {
        setMeal(
          snapshot?.meals.find(item => normalizeWidgetEventDate(item.date) === currentToday)
            ?.dishNames ?? [],
        );
      } else setMeal([]);

      if (personalResult.status === "fulfilled" || sharedTasksResult.status === "fulfilled") {
        const personalItems: WidgetTaskSummary[] = personal
          .filter(task => task.kind !== "schedule")
          .map(task => ({
            id: `personal-${task.id}`,
            title: task.title,
            deadline: task.date,
            source: "개인 업무",
            completed: task.completed,
            rank: deadlineRank(task.date, currentToday),
          }));
        const assignedItems: WidgetTaskSummary[] = sharedTasks
          .filter(task => task.targetNames.includes(teacher))
          .map(task => ({
            id: `shared-${task.id}`,
            title: task.title,
            deadline: task.deadline,
            source: "배부 업무",
            completed: isSharedWorkComplete(task, teacher),
            rank: deadlineRank(task.deadline, currentToday),
          }));
        setTaskItems([...personalItems, ...assignedItems].sort(
          (a, b) => Number(a.completed) - Number(b.completed)
            || a.rank - b.rank
            || (a.deadline || "9999").localeCompare(b.deadline || "9999")
            || a.title.localeCompare(b.title, "ko"),
        ));
      } else setTaskItems([]);

      const baseEventsForDate = (date: string) => buildWidgetBaseEvents(date, {
        personal, sharedTasks, schoolSchedules: snapshot?.schedules ?? [], committeeEvents: committee.events,
        includeCompletedTasks: settings.includeCompletedTasks,
      }, teacher);

      const todayRows = sortWidgetEvents([
        ...baseEventsForDate(currentToday),
        ...todaySupplement.events,
      ]);
      setEvents(todayRows);
      const targetRows = sortWidgetEvents([
        ...baseEventsForDate(targetDate),
        ...targetSupplement.events,
      ].filter(item => item.kind !== "gate" && item.kind !== "meal"));
      const tomorrowRule = getAcademicDayRule(previewTarget.tomorrow.date);
      setTomorrow({
        date: targetDate,
        continued: previewTarget.continued,
        day: targetDay,
        firstEvent: targetRows[0] ?? null,
        duties: targetSupplement.duties,
        tomorrowRuleLabel: previewTarget.continued
          ? `${dateLabel(previewTarget.tomorrow.date)}은(는) ${tomorrowRule.label || "비수업일"}이라 다음 수업일을 표시합니다.`
          : targetDay?.rule.label ?? "",
      });

      setOffline([
        timetableResult,
        changesResult,
        snapshotResult,
        committeeResult,
      ].some(result => result.status === "rejected")
        || todaySupplement.failed
        || targetSupplement.failed);
    } finally {
      if (generation === remoteGenerationRef.current) setSyncing(false);
    }
  }, [
    auth.authenticated,
    auth.teacherName,
    settings.continueToNextInstructionDay,
    settings.includeCompletedTasks,
  ]);

  useEffect(() => {
    void (async () => {
      await loadConfig();
      await auth.bootstrap();
      setSettings(normalizeWidgetSettings(await window.electron.widgetGetSettings()));
      setAutoLaunch(await window.electron.getAutoLaunch());
      const noticeSeen = await window.electron.configGet("widget.firstRunNoticeSeen");
      if (noticeSeen !== true) setFirstRunNotice(true);
      const savedHiddenMenus = await window.electron.configGet("sidebar.hiddenMenus.v1");
      setHiddenMenus(Array.isArray(savedHiddenMenus)
        ? savedHiddenMenus.filter((value): value is string => typeof value === "string")
        : []);
      void fetchNotices();
    })();
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    const offAuth = window.electron.onAuthChanged(() => void auth.bootstrap());
    const offSettings = window.electron.onWidgetSettingsChanged(value => {
      setSettings(normalizeWidgetSettings(value));
    });
    return () => {
      clearInterval(clock);
      offAuth();
      offSettings();
    };
  }, []);

  useEffect(() => {
    const owner = auth.authenticated ? auth.teacherName : "";
    remoteGenerationRef.current += 1;
    localGenerationRef.current += 1;
    setDataOwner(owner);
    setDay(null);
    setTomorrow({
      date: addDaysYmd(ymd(), 1),
      continued: false,
      day: null,
      firstEvent: null,
      duties: [],
      tomorrowRuleLabel: "",
    });
    setEvents([]);
    setMeal([]);
    setTaskItems([]);
    setPendingChanges(0);
    setChangeAlerts([]);
    setMemos([]);
    setSnippets([]);
    setLuckyCard(null);
    setOpenPanel(null);
    setSyncing(false);
    setOffline(false);
    setTimetableUnavailable(false);
    if (owner) void refreshLocal();
  }, [auth.authenticated, auth.teacherName, refreshLocal]);

  useEffect(() => {
    if (!auth.authenticated || !auth.teacherName) return;
    void (async () => {
      const saved = await widgetLocalAdapter.get("briefingDisplay.v1");
      const value = saved && typeof saved === "object"
        ? saved as Partial<BriefingDisplayState>
        : {};
      setBriefingDisplay(value.date === today
        ? {
          date: today,
          dismissed: Boolean(value.dismissed),
          snoozedUntil: typeof value.snoozedUntil === "string" ? value.snoozedUntil : "",
        }
        : { date: today, dismissed: false, snoozedUntil: "" });
    })();
  }, [auth.authenticated, auth.teacherName, today, widgetLocalAdapter]);

  // Keep the interval tied to the latest authenticated refresh closure. The
  // old empty-dependency interval kept the first logged-out closure forever.
  useEffect(() => {
    if (!auth.authenticated || !auth.teacherName) return;
    void refresh(false);
    const sync = window.setInterval(() => void refresh(false), 10 * 60_000);
    return () => clearInterval(sync);
  }, [auth.authenticated, auth.teacherName, refresh, today]);

  useEffect(() => {
    const shell = shellRef.current;
    const content = contentRef.current;
    if (!shell || !content) return;
    let frame = 0;
    let lastRequested = -1;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const heightOf = (element: HTMLElement | null) => element?.getBoundingClientRect().height ?? 0;
        const scrollBody = settings.expanded ? content.parentElement : null;
        const style = scrollBody ? getComputedStyle(scrollBody) : null;
        const padding = style ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : 0;
        const naturalHeight = Math.ceil(heightOf(headerRef.current) + heightOf(noticeRef.current)
          + Math.max(content.scrollHeight, heightOf(content)) + heightOf(actionsRef.current) + padding + 2);
        const requested = showSettings ? Math.max(naturalHeight, 320) : naturalHeight;
        if (requested !== lastRequested) {
          lastRequested = requested;
          void window.electron.widgetFitHeight(requested);
        }
      });
    };
    const observer = new ResizeObserver(fit);
    [content, headerRef.current, noticeRef.current, actionsRef.current].forEach(element => {
      if (element) observer.observe(element);
    });
    fit();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [auth.ready, auth.authenticated, dataOwner, settings.expanded, showSettings, firstRunNotice]);

  useEffect(() => {
    if (!openPanel) return;
    const frame = requestAnimationFrame(() => {
      const panel = popoverRef.current;
      const body = panel?.closest('.widget-scroll-body');
      if (!panel || !body) return;
      const panelBounds = panel.getBoundingClientRect();
      const bodyBounds = body.getBoundingClientRect();
      if (panelBounds.top < bodyBounds.top || panelBounds.bottom > bodyBounds.bottom) {
        panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [openPanel]);

  const fortune = useMemo(
    () => getLocalDailyFortune(auth.teacherName || config.teacherName || "", today),
    [auth.teacherName, config.teacherName, today],
  );
  const noticeAlerts = useMemo<WidgetAlertSummary[]>(
    () => notices
      .filter(item => item.id > lastReadId)
      .map(item => ({
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
  const pendingTaskItems = useMemo(
    () => taskItems.filter(item => !item.completed),
    [taskItems],
  );
  const taskCount = pendingTaskItems.length;
  const filteredEvents = useMemo(
    () => events.filter(event => {
      if (event.kind === "personal-schedule") return settings.showPersonalSchedules;
      if (event.kind === "personal-task" || event.kind === "shared-task") {
        return settings.showPersonalTasksInEvents;
      }
      if (event.kind === "school") return settings.showNeisSchedules;
      if (event.kind === "committee") return settings.showCommitteeEvents;
      if (event.kind === "weekly") return settings.showWeeklyPlans;
      if (event.kind === "gate") return settings.showGateDuty;
      if (event.kind === "meal") return settings.showMealDuty;
      if (event.kind === "creative") return settings.showCreativeActivities;
      return true;
    }),
    [events, settings],
  );
  const timerView = useMemo(() => {
    const value = actualTimerView(day, now);
    return timetableUnavailable
      ? { ...value, detail: [value.detail, "최신 시간표 확인 필요"].filter(Boolean).join(" · ") }
      : value;
  }, [day, now, timetableUnavailable]);
  const timedEvents = useMemo(() => settings.showTimedEvents ? filteredEvents : [], [filteredEvents, settings.showTimedEvents]);
  const timedEventCount = useMemo(() => normalizeWidgetTimedEvents(today, timedEvents).length, [today, timedEvents]);
  const currentLesson = timerView.currentPeriod
    ? day?.lessons[timerView.currentPeriod - 1]
    : null;
  const nextActualLesson = useMemo(() => {
    if (!day) return null;
    const floor = timerView.currentPeriod ?? timerView.completedPeriod ?? 0;
    return day.lessons.find(lesson => lesson.period > floor && Boolean(lesson.value)) ?? null;
  }, [day, timerView]);
  const nextLessonMinutes = nextActualLesson
    ? Math.max(0, Math.ceil(clockMinutes(UNGCHEON_PERIOD_PLAN[nextActualLesson.period - 1].start) - minuteOfDay(now)))
    : null;
  const taskBuckets = useMemo(
    () => buildTaskBuckets(
      taskItems.map(item => ({
        ...item,
        meta: deadlineLabel(item.deadline, today),
      })),
      today,
      settings.includeCompletedTasks,
    ),
    [settings.includeCompletedTasks, taskItems, today],
  );
  const weatherActions = useMemo(() => {
    if (!weather.data) return [];
    return buildWeatherActions(
      weather.data.hourly
        .filter(point => point.time.startsWith(today))
        .map(point => ({
          time: point.time,
          precipitationProbability: point.precipitationProbability,
          windSpeedKph: point.windSpeed,
          temperatureC: point.temp,
        })),
      {
        now,
        fetchedAt: weather.data.updatedAt,
        ...settings.weatherAlerts,
      },
    );
  }, [now, settings.weatherAlerts, today, weather.data]);
  const shortcutOptions = useMemo(
    () => SHORTCUT_OPTIONS.map(item => hiddenMenus.includes(item.id)
      ? { ...item, label: `${item.label} (숨김 메뉴)` }
      : item),
    [hiddenMenus],
  );
  const shortcuts = useMemo(
    () => settings.shortcutIds
      .map(id => shortcutOptions.find(item => item.id === id))
      .filter((item): item is WidgetShortcutOption => Boolean(item)),
    [settings.shortcutIds, shortcutOptions],
  );
  const tomorrowView = useMemo<WidgetTomorrowPreviewView>(() => {
    const firstLesson = tomorrow.day?.lessons.find(lesson => Boolean(lesson.value));
    const previewAllowed = shouldShowTomorrowPreview(
      now,
      settings.tomorrowStartTime,
      UNGCHEON_PERIOD_PLAN.at(-1)?.end,
    );
    if (!previewAllowed) {
      return {
        dateLabel: dateLabel(tomorrow.date),
        dayLabel: tomorrow.continued ? "다음 수업일" : "내일",
        ruleLabel: `${settings.tomorrowStartTime} 이후 또는 마지막 수업 종료 뒤에 표시합니다.`,
        firstLesson: null,
        firstEvent: null,
        duties: [],
      };
    }
    return {
      dateLabel: dateLabel(tomorrow.date),
      dayLabel: tomorrow.continued ? "다음 수업일" : "내일",
      ruleLabel: tomorrow.tomorrowRuleLabel,
      firstLesson: firstLesson
        ? {
          title: firstLesson.value.replace("\n", " · "),
          meta: firstLesson.badge,
          time: UNGCHEON_PERIOD_PLAN[firstLesson.period - 1]?.start,
          kind: "lesson",
        }
        : null,
      firstEvent: tomorrow.firstEvent
        ? {
          title: tomorrow.firstEvent.title,
          meta: tomorrow.firstEvent.meta,
          time: tomorrow.firstEvent.time,
          kind: "event",
        }
        : null,
      duties: tomorrow.duties.map(item => ({
        title: item.title,
        meta: item.meta,
        time: item.time,
        kind: "duty" as const,
      })),
    };
  }, [now, settings.tomorrowStartTime, tomorrow]);

  const changeLuckyKind = (luckyCardKind: LuckyCardKind) => {
    setLuckyCard(null);
    void applySettings({ luckyCardKind });
  };

  const addMemo = async (text: string, retention: QuickMemoRetention) => {
    setLocalBusy(true);
    try {
      setMemos(await addWidgetQuickMemo(text, retention, widgetLocalAdapter, today));
    } finally {
      setLocalBusy(false);
    }
  };
  const deleteMemo = async (id: string) => {
    setLocalBusy(true);
    try {
      setMemos(await removeWidgetQuickMemo(id, widgetLocalAdapter));
    } finally {
      setLocalBusy(false);
    }
  };
  const toggleMemo = async (id: string) => {
    setLocalBusy(true);
    try {
      setMemos(await toggleWidgetQuickMemo(id, widgetLocalAdapter));
    } finally {
      setLocalBusy(false);
    }
  };
  const updateMemo = async (id: string, text: string) => {
    setLocalBusy(true);
    try {
      setMemos(await updateWidgetQuickMemo(id, { text }, widgetLocalAdapter));
    } finally {
      setLocalBusy(false);
    }
  };
  const convertMemo = async (id: string) => {
    const memo = memos.find(item => item.id === id);
    if (!memo) return;
    setLocalBusy(true);
    try {
      const draft = quickMemoToPersonalTaskDraft(memo, today);
      const title = window.prompt("개인 업무 제목을 확인해 주세요.", draft.title);
      if (title === null || !title.trim()) return;
      const memoText = window.prompt("개인 업무 내용을 확인해 주세요.", draft.memo);
      if (memoText === null) return;
      const deadline = window.prompt("업무 기한을 YYYY-MM-DD 형식으로 확인해 주세요.", draft.date);
      if (deadline === null) return;
      const taskDate = /^\d{4}-\d{2}-\d{2}$/.test(deadline.trim()) ? deadline.trim() : today;
      const tasks = await loadPersonalTasks();
      const timestamp = new Date().toISOString();
      const task: PersonalTask = {
        ...draft,
        title: title.trim().slice(0, 80),
        date: taskDate,
        memo: memoText,
        id: createPersonalTaskId(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await savePersonalTasks([...tasks, task]);
      setMemos(await removeWidgetQuickMemo(id, widgetLocalAdapter));
      void refresh(false);
    } finally {
      setLocalBusy(false);
    }
  };
  const addSnippet = async (label: string, text: string) => {
    setLocalBusy(true);
    try {
      setSnippets(await addWidgetQuickSnippet(label, text, widgetLocalAdapter));
    } finally {
      setLocalBusy(false);
    }
  };
  const deleteSnippet = async (id: string) => {
    setLocalBusy(true);
    try {
      setSnippets(await removeWidgetQuickSnippet(id, widgetLocalAdapter));
    } finally {
      setLocalBusy(false);
    }
  };

  if (!auth.ready) {
    return <div className="widget-shell widget-loading">위젯 준비 중…</div>;
  }
  if (!auth.authenticated) {
    return (
      <div className="widget-shell widget-login">
        <strong>로그인이 필요합니다</strong>
        <span>개인 시간표와 업무는 로그인 후 표시됩니다.</span>
        <button onClick={() => window.electron.widgetOpenMain("dashboard")}>
          업무도우미에서 로그인
        </button>
      </div>
    );
  }
  if (dataOwner !== auth.teacherName) {
    return <div className="widget-shell widget-loading">교사별 위젯 자료 준비 중…</div>;
  }

  const timetableModule = (
    <WidgetTimetable date={today} lessons={day?.lessons ?? []} now={now} events={timedEvents}
      rule={day?.rule} timetableUnavailable={!day || timetableUnavailable} timer={timerView}
      syncing={syncing} onRefresh={() => void refresh(true)} />
  );

  const mealModule = (
    <section className="widget-section meal-section" title={meal.join(" · ")}>
      <div className="section-title"><span><Utensils size={15} /> 오늘 급식</span></div>
      <p>{meal.length ? meal.join(" · ") : "급식 정보를 준비하고 있습니다."}</p>
    </section>
  );

  const fortuneModule = (
    <section className="widget-section fortune-section">
      <div className="fortune-heading">오늘의 운세</div>
      <p>{fortune.phrase}</p>
      <div>
        <span className="color-dot" style={{ background: fortune.colorHex }} /> 행운의 색 <b>{fortune.colorName}</b>
        <span className="fortune-number">행운의 숫자 <b>{fortune.luckyNumber}</b></span>
      </div>
    </section>
  );

  const luckyCardModule = (
    <section className="widget-section lucky-card-section">
      <div className="section-title">
        <span><Sparkles size={14} /> 오늘의 행운카드</span>
        <span className="lucky-kind-switch" aria-label="행운카드 종류">
          <button className={settings.luckyCardKind === "tarot" ? "active" : ""} onClick={() => changeLuckyKind("tarot")}>타로</button>
          <button className={settings.luckyCardKind === "hwatu" ? "active" : ""} onClick={() => changeLuckyKind("hwatu")}>화투</button>
        </span>
      </div>
      {!luckyCard ? (
        <div className="lucky-card-prompt">
          <p>궁금한 내용을 머릿속으로 떠올리며 클릭해주세요</p>
          <button onClick={() => setLuckyCard(drawLocalLuckyCard(settings.luckyCardKind))}>
            <span className="card-back">✦</span> 카드 뽑기
          </button>
        </div>
      ) : (
        <div className="lucky-card-result">
          <div className={`lucky-card-art ${luckyCard.kind}`} style={{ "--card-accent": luckyCard.colorHex } as CSSProperties}>
            {luckyCard.kind === "hwatu"
              ? <HwatuCardArt cardId={luckyCard.id} name={luckyCard.name} />
              : <><span>{luckyCard.symbol}</span><small>{luckyCard.subtitle}</small></>}
          </div>
          <div className="lucky-card-copy">
            <b>{luckyCard.name}</b>
            <p>{luckyCard.message}</p>
            <dl>
              <div><dt>업무</dt><dd>{luckyCard.work}</dd></div>
              <div><dt>관계</dt><dd>{luckyCard.relationship}</dd></div>
              <div><dt>한마디</dt><dd>{luckyCard.advice}</dd></div>
            </dl>
            <div className="lucky-card-luck">
              <span className="color-dot" style={{ background: luckyCard.colorHex }} /> {luckyCard.colorName}
              <b>{luckyCard.luckyNumber}</b>
            </div>
          </div>
          <div className="lucky-card-controls">
            <button className="lucky-card-redraw" onClick={() => setLuckyCard(drawLocalLuckyCard(settings.luckyCardKind, luckyCard.id))}>다시 뽑기</button>
            <button className="lucky-card-close" onClick={() => setLuckyCard(null)}>카드 닫기</button>
          </div>
        </div>
      )}
      <small className="lucky-card-note">외부 전송 없이 이 PC에서 무작위로 뽑는 긍정 메시지입니다.</small>
    </section>
  );

  const endOfDayClock = clockMinutes(settings.endOfDay.time);
  const snoozedUntil = briefingDisplay.snoozedUntil
    ? new Date(briefingDisplay.snoozedUntil).getTime()
    : 0;
  const endOfDayVisible = !briefingDisplay.dismissed
    && (!snoozedUntil || now.getTime() >= snoozedUntil)
    && (minuteOfDay(now) >= endOfDayClock || timerView.phase === "after-school");
  const firstTomorrowLesson = tomorrow.day?.lessons.find(lesson => Boolean(lesson.value));
  const moduleNodes: Record<WidgetModuleId, ReactNode> = {
    timetable: timetableModule,
    timer: <WidgetPeriodTimerModule value={timerView} />,
    meal: mealModule,
    fortune: fortuneModule,
    "lucky-card": luckyCardModule,
    tomorrow: <WidgetTomorrowModule value={tomorrowView} />,
    memo: (
      <WidgetQuickMemo
        memos={memos}
        busy={localBusy}
        onAdd={addMemo}
        onToggle={toggleMemo}
        onUpdate={updateMemo}
        onDelete={deleteMemo}
        onConvertToTask={convertMemo}
      />
    ),
    shortcuts: (
      <WidgetShortcutsModule
        shortcuts={shortcuts}
        onOpen={page => window.electron.widgetOpenMain(page)}
      />
    ),
    weather: (
      <WidgetWeatherModule
        location={weather.displayName}
        temperature={weather.data ? `${weather.data.temp}℃ · ${weather.data.weatherDesc}` : undefined}
        updatedAt={weather.data?.updatedAt}
        actions={weatherActions}
        loading={weather.loading}
      />
    ),
    tasks: (
      <WidgetTaskTimelineModule
        buckets={taskBuckets}
        onOpenTasks={() => window.electron.widgetOpenMain("staff_tasks")}
      />
    ),
    "quick-tools": (
      <WidgetQuickTools
        snippets={snippets}
        busy={localBusy}
        onGenerateQr={value => QRCode.toDataURL(value, {
          width: 240,
          margin: 2,
          color: { dark: "#172033", light: "#ffffff" },
        })}
        onAddSnippet={addSnippet}
        onDeleteSnippet={deleteSnippet}
      />
    ),
    "end-of-day": (
      <WidgetEndOfDayModule value={{
        visible: endOfDayVisible,
        incompleteTaskCount: settings.endOfDay.includeTasks ? taskCount : 0,
        tomorrowLesson: settings.endOfDay.includeTomorrowLesson && firstTomorrowLesson
          && !tomorrow.continued
          ? firstTomorrowLesson.value.replace("\n", " · ")
          : undefined,
        tomorrowEvent: settings.endOfDay.includeTomorrowEvents && !tomorrow.continued
          ? tomorrow.firstEvent?.title
          : undefined,
        tomorrowDuty: settings.endOfDay.includeTomorrowDuty && !tomorrow.continued
          ? tomorrow.duties[0]?.title
          : undefined,
        tomorrowReason: tomorrow.continued
          ? tomorrow.tomorrowRuleLabel
          : undefined,
        memoCount: settings.endOfDay.includeMemos
          ? memos.filter(item => !item.completed).length
          : 0,
      }}
      onDismiss={() => {
        const next = { date: today, dismissed: true, snoozedUntil: "" };
        setBriefingDisplay(next);
        void widgetLocalAdapter.set("briefingDisplay.v1", next);
      }}
      onSnooze={() => {
        const next = {
          date: today,
          dismissed: false,
          snoozedUntil: new Date(now.getTime() + 10 * 60_000).toISOString(),
        };
        setBriefingDisplay(next);
        void widgetLocalAdapter.set("briefingDisplay.v1", next);
      }}
      onOpenDetails={() => window.electron.widgetOpenMain("dashboard")} />
    ),
  };

  return (
    <div
      ref={shellRef}
      data-widget-density={settings.density}
      className={`widget-shell preset-${settings.preset} ${settings.expanded ? "is-expanded" : "is-collapsed"} widget-density-${settings.density}`}
    >
      <header ref={headerRef} className="widget-header drag-region">
        <span className="widget-grip"><GripHorizontal size={16} /></span>
        <div className="widget-identity">
          <i className={offline ? "offline" : "online"} />
          <b>{auth.teacherName} 선생님</b>
          <small>· {format(now, "M월 d일(EEE) HH:mm", { locale: ko })}</small>
        </div>
        <nav className="no-drag">
          <button title={settings.pinned ? "항상 위에 표시 해제" : "항상 위에 표시"} onClick={() => void applySettings({ pinned: !settings.pinned })}>
            {settings.pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button title="설정" onClick={() => setShowSettings(value => !value)}><Settings2 size={15} /></button>
          <button title={settings.expanded ? "접기" : "펼치기"} onClick={() => void applySettings({ expanded: !settings.expanded })}>
            {settings.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button title="위젯 숨기기" onClick={() => window.electron.hideWidget()}><X size={16} /></button>
        </nav>
      </header>

      {showSettings && (
        <section className="widget-settings no-drag">
          <label>
            디자인
            <select value={settings.preset} onChange={event => void applySettings({ preset: event.target.value as WidgetPreset })}>
              {PRESETS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>
            투명도
            <input type="range" min="65" max="100" value={Math.round(settings.opacity * 100)} onChange={event => void applySettings({ opacity: Number(event.target.value) / 100 })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={autoLaunch} onChange={async event => {
              setAutoLaunch(event.target.checked);
              await window.electron.setAutoLaunch(event.target.checked);
            }} /> Windows 시작 시 위젯 자동 실행
          </label>
          <WidgetSettingsPanel
            settings={settings}
            shortcutOptions={shortcutOptions}
            onChange={patch => applySettings(patch)}
          />
          <div className="widget-event-filters">
            <strong>시간표에 표시할 일정 종류</strong>
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
                  onChange={event => void applySettings({ [key]: event.target.checked })}
                /> {label}
              </label>
            ))}
            <small>시간 또는 교시가 지정된 일정만 시간표 오른쪽에 표시합니다. 종일 일정·날짜만 있는 업무는 기존 캘린더/업무센터에서 확인하세요. 대시보드 설정과는 별도로 저장됩니다.</small>
          </div>
          {isWidgetModuleVisible(settings, "lucky-card") && (
            <label>
              행운카드 종류
              <select value={settings.luckyCardKind} onChange={event => changeLuckyKind(event.target.value as LuckyCardKind)}>
                <option value="tarot">타로</option>
                <option value="hwatu">화투</option>
              </select>
            </label>
          )}
        </section>
      )}

      {firstRunNotice && (
        <div ref={noticeRef} className="widget-first-run-notice no-drag flex shrink-0 items-center justify-between gap-2 border-b border-amber-300 bg-amber-100 px-3 py-2 text-[9px] font-extrabold text-amber-950">
          <span>PC를 켜면 미니 위젯도 자동으로 시작됩니다.</span>
          <button className="rounded-md border border-amber-400 bg-white px-2 py-1 text-[9px] font-bold text-amber-950" onClick={async () => {
            await window.electron.configSet("widget.firstRunNoticeSeen", true);
            setFirstRunNotice(false);
          }}>확인</button>
        </div>
      )}

      {!settings.expanded ? (
        <div ref={contentRef} className="widget-compact">
          <div><span>현재</span><b>{currentLesson?.value.replace("\n", " · ") || timerView.label}</b></div>
          <div><span>다음{nextLessonMinutes === null ? '' : ` ${nextLessonMinutes}분 후`}</span><b>{nextActualLesson?.value.replace("\n", " · ") || "수업 없음"}</b></div>
          <div className="compact-counts">
            <span title="오늘 시간 지정 일정"><CalendarDays size={13} /> {timedEventCount}</span>
            <span><BriefcaseBusiness size={13} /> {taskCount}</span>
            <span title="새 알림"><Bell size={13} /> {unread}</span>
          </div>
        </div>
      ) : (
        <>
        <main className="widget-scroll-body">
          <div ref={contentRef} className="widget-content">
          {settings.moduleOrder
            .filter(id => WIDGET_MODULE_IDS.includes(id) && isWidgetModuleVisible(settings, id))
            .map(id => <div key={id} className={`widget-module-slot widget-module-${id}`}>{moduleNodes[id]}</div>)}

          {openPanel && (
            <section ref={popoverRef} className="widget-popover no-drag" aria-label={openPanel === "tasks" ? "미완료 업무 요약" : "새 알림 요약"}>
              <div className="widget-popover-heading">
                <b>{openPanel === "tasks" ? "미완료 업무" : "새 알림"}</b>
                <button title="닫기" onClick={() => setOpenPanel(null)}><X size={14} /></button>
              </div>
              <div className="widget-popover-list">
                {openPanel === "tasks"
                  ? pendingTaskItems.slice(0, 5).map(item => (
                    <div className="widget-popover-row" key={item.id}>
                      <span className="widget-source">{item.source}</span>
                      <div><b>{item.title}</b><small>{deadlineLabel(item.deadline, today)}</small></div>
                    </div>
                  ))
                  : alertItems.slice(0, 5).map(item => (
                    <div className="widget-popover-row" key={item.id}>
                      <span className={`widget-source ${item.kind}`}>{item.kind === "notice" ? "공지" : "수업"}</span>
                      <div><b>{item.title}</b><small>{item.meta}</small></div>
                    </div>
                  ))}
                {(openPanel === "tasks" ? pendingTaskItems.length : alertItems.length) === 0 && <p className="empty">표시할 내용이 없습니다.</p>}
              </div>
              {(openPanel === "tasks" ? pendingTaskItems.length : alertItems.length) > 5 && (
                <small className="widget-popover-more">외 {(openPanel === "tasks" ? pendingTaskItems.length : alertItems.length) - 5}건</small>
              )}
              <button className="widget-popover-open" onClick={() => window.electron.widgetOpenMain(openPanel === "tasks" ? "staff_tasks" : "dashboard")}>
                {openPanel === "tasks" ? "업무센터에서 전체 보기" : "알림 전체 보기"}
              </button>
            </section>
          )}

          </div>
        </main>
          <section ref={actionsRef} className="widget-actions">
            <button className={openPanel === "tasks" ? "active" : ""} onClick={() => setOpenPanel(value => value === "tasks" ? null : "tasks")}>
              <BriefcaseBusiness size={15} /><span>미완료 업무</span><b>{taskCount}</b>
            </button>
            <button className={openPanel === "alerts" ? "active" : ""} onClick={() => setOpenPanel(value => value === "alerts" ? null : "alerts")}>
              <Bell size={15} /><span>새 알림</span><b>{unread}</b>
            </button>
            <button className="open-main" onClick={() => window.electron.widgetOpenMain("dashboard")}>
              <LayoutDashboard size={15} /> 프로그램 열기
            </button>
          </section>
        </>
      )}
    </div>
  );
}
