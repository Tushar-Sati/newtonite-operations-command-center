from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import Priority, TeamRole, WorkItemStatus


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    full_name: str


class KpiDeltas(BaseModel):
    open: float = 0
    in_progress: float = 0
    overdue: float = 0
    approvals: float = 0


class KpiSummary(BaseModel):
    open_items: int
    in_progress_items: int
    overdue_items: int
    pending_approvals: int
    deltas: KpiDeltas


class WeeklyWorkload(BaseModel):
    label: str
    created: int
    completed: int


class TeamWorkload(BaseModel):
    team_id: str
    team: str
    members: int
    open: int
    in_progress: int
    capacity: int


class ActivityEvent(BaseModel):
    id: str
    actor: str
    action: str
    target: str
    timestamp: datetime
    kind: str


class DashboardWorkItem(BaseModel):
    id: str
    title: str
    team: str
    assignee: str
    status: WorkItemStatus
    priority: Priority
    due_date: date | None
    overdue: bool


class DashboardResponse(BaseModel):
    kpis: KpiSummary
    weekly: list[WeeklyWorkload]
    teams: list[TeamWorkload]
    activity: list[ActivityEvent]
    work_items: list[DashboardWorkItem]


class WorkItemCreate(BaseModel):
    key: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    title: str = Field(min_length=1, max_length=240)
    description: str | None = None
    assignee_id: str | None = None
    priority: Priority = Priority.MEDIUM
    due_date: date | None = None


class WorkItemUpdate(BaseModel):
    expected_version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = None
    assignee_id: str | None = None
    status: WorkItemStatus | None = None
    priority: Priority | None = None
    due_date: date | None = None


class WorkItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    key: str
    title: str
    description: str | None
    team_id: str
    assignee_id: str | None
    status: WorkItemStatus
    priority: Priority
    due_date: date | None
    version: int
    created_at: datetime
    updated_at: datetime


class TeamResponse(BaseModel):
    id: str
    name: str
    capacity: int
    role: TeamRole
    member_count: int


class TeamMemberResponse(BaseModel):
    user_id: str
    full_name: str
    role: TeamRole


class ActivityWorkItemReference(BaseModel):
    id: str
    key: str
    title: str


class ActivityRecordResponse(BaseModel):
    id: str
    actor: str
    action: str
    kind: str
    occurred_at: datetime
    work_item: ActivityWorkItemReference | None


class ApprovalRequest(BaseModel):
    expected_version: int = Field(ge=1)
