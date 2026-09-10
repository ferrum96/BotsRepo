export const IdentifierType = {
  PHONE: 'PHONE',
  TELEGRAM_ID: 'TELEGRAM_ID',
  TELEGRAM_USERNAME: 'TELEGRAM_USERNAME',
  EMAIL: 'EMAIL',
  URL: 'URL',
} as const;
export type IdentifierType = (typeof IdentifierType)[keyof typeof IdentifierType];

/** Порядок поиска дублей из п. 3 ТЗ: телефон → Telegram → email → ссылка/username. */
export const DEDUP_LOOKUP_ORDER: IdentifierType[] = [
  IdentifierType.PHONE,
  IdentifierType.TELEGRAM_ID,
  IdentifierType.EMAIL,
  IdentifierType.TELEGRAM_USERNAME,
  IdentifierType.URL,
];

export const ChannelKind = {
  TELEGRAM: 'TELEGRAM',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
} as const;
export type ChannelKind = (typeof ChannelKind)[keyof typeof ChannelKind];

export const AutomationEligibility = {
  UNKNOWN: 'UNKNOWN',
  AUTO_OK: 'AUTO_OK',
  MANUAL_ONLY: 'MANUAL_ONLY',
  BLOCKED: 'BLOCKED',
} as const;
export type AutomationEligibility =
  (typeof AutomationEligibility)[keyof typeof AutomationEligibility];

export const AutomationStatus = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  STOPPED_BY_REPLY: 'STOPPED_BY_REPLY',
  STOPPED_BY_MANAGER: 'STOPPED_BY_MANAGER',
  STOPPED_BY_OPT_OUT: 'STOPPED_BY_OPT_OUT',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type AutomationStatus = (typeof AutomationStatus)[keyof typeof AutomationStatus];

export const ACTIVE_AUTOMATION_STATUSES: AutomationStatus[] = [AutomationStatus.ACTIVE];

export const AutomationStep = {
  NEW: 'NEW',
  ELIGIBILITY_CHECK: 'ELIGIBILITY_CHECK',
  MANUAL_OUTREACH_REQUIRED: 'MANUAL_OUTREACH_REQUIRED',
  FIRST_MESSAGE_QUEUED: 'FIRST_MESSAGE_QUEUED',
  FIRST_MESSAGE_SENT: 'FIRST_MESSAGE_SENT',
  WAITING_FOR_REPLY: 'WAITING_FOR_REPLY',
  FOLLOWUP_D3_QUEUED: 'FOLLOWUP_D3_QUEUED',
  FOLLOWUP_D3_SENT: 'FOLLOWUP_D3_SENT',
  FOLLOWUP_D7_QUEUED: 'FOLLOWUP_D7_QUEUED',
  FOLLOWUP_D7_SENT: 'FOLLOWUP_D7_SENT',
  FOLLOWUP_D14_QUEUED: 'FOLLOWUP_D14_QUEUED',
  FOLLOWUP_D14_SENT: 'FOLLOWUP_D14_SENT',
  FOLLOWUP_D30_QUEUED: 'FOLLOWUP_D30_QUEUED',
  FOLLOWUP_D30_SENT: 'FOLLOWUP_D30_SENT',
  LONG_TERM_NURTURE: 'LONG_TERM_NURTURE',
} as const;
export type AutomationStep = (typeof AutomationStep)[keyof typeof AutomationStep];

/** Шаг сценария касаний: D0, D+3, D+7, D+14, D+30 (п. 11 ТЗ). */
export const OutreachStep = {
  FIRST: 'FIRST',
  FOLLOWUP_D3: 'FOLLOWUP_D3',
  FOLLOWUP_D7: 'FOLLOWUP_D7',
  FOLLOWUP_D14: 'FOLLOWUP_D14',
  FOLLOWUP_D30: 'FOLLOWUP_D30',
} as const;
export type OutreachStep = (typeof OutreachStep)[keyof typeof OutreachStep];

export const OUTREACH_SEQUENCE: { step: OutreachStep; delayDays: number }[] = [
  { step: OutreachStep.FIRST, delayDays: 0 },
  { step: OutreachStep.FOLLOWUP_D3, delayDays: 3 },
  { step: OutreachStep.FOLLOWUP_D7, delayDays: 7 },
  { step: OutreachStep.FOLLOWUP_D14, delayDays: 14 },
  { step: OutreachStep.FOLLOWUP_D30, delayDays: 30 },
];

export const Pipeline = {
  PARTNER_ACQUISITION: 'PARTNER_ACQUISITION',
  PARTNER_ACTIVATION: 'PARTNER_ACTIVATION',
} as const;
export type Pipeline = (typeof Pipeline)[keyof typeof Pipeline];

/** Воронка «Астро-партнёры», п. 5 ТЗ. Локальный enum, мапинг на ID amoCRM — в конфиге. */
export const AcquisitionStage = {
  NEW_PROSPECT: 'NEW_PROSPECT',
  FIRST_TOUCH_SENT: 'FIRST_TOUCH_SENT',
  NURTURING: 'NURTURING',
  REPLIED: 'REPLIED',
  QUALIFIED: 'QUALIFIED',
  INTERESTED: 'INTERESTED',
  CALL_SCHEDULED: 'CALL_SCHEDULED',
  THINKING: 'THINKING',
  PARTNER_CONNECTED: 'PARTNER_CONNECTED',
  PARTNER_ACTIVE: 'PARTNER_ACTIVE',
  CLOSED_NOT_TARGET: 'CLOSED_NOT_TARGET',
  CLOSED_REFUSED: 'CLOSED_REFUSED',
  CLOSED_NO_CONTACT: 'CLOSED_NO_CONTACT',
  CLOSED_NO_STONES: 'CLOSED_NO_STONES',
} as const;
export type AcquisitionStage = (typeof AcquisitionStage)[keyof typeof AcquisitionStage];

export const CLOSED_ACQUISITION_STAGES: AcquisitionStage[] = [
  AcquisitionStage.CLOSED_NOT_TARGET,
  AcquisitionStage.CLOSED_REFUSED,
  AcquisitionStage.CLOSED_NO_CONTACT,
  AcquisitionStage.CLOSED_NO_STONES,
];

/** Воронка активации, п. 16 ТЗ. */
export const ActivationStage = {
  CONNECTED: 'CONNECTED',
  MATERIALS_REVIEWED: 'MATERIALS_REVIEWED',
  FIRST_REFERRAL: 'FIRST_REFERRAL',
  FIRST_CLIENT: 'FIRST_CLIENT',
  FIRST_SALE: 'FIRST_SALE',
  ACTIVE_PARTNER: 'ACTIVE_PARTNER',
} as const;
export type ActivationStage = (typeof ActivationStage)[keyof typeof ActivationStage];

export const ImportRowStatus = {
  NEW: 'NEW',
  VALIDATED: 'VALIDATED',
  NORMALIZED: 'NORMALIZED',
  PROCESSING: 'PROCESSING',
  IMPORTED: 'IMPORTED',
  DUPLICATE_MERGED: 'DUPLICATE_MERGED',
  DUPLICATE_SKIPPED: 'DUPLICATE_SKIPPED',
  DUPLICATE_IN_FILE: 'DUPLICATE_IN_FILE',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  MANUAL_OUTREACH: 'MANUAL_OUTREACH',
  FAILED: 'FAILED',
} as const;
export type ImportRowStatus = (typeof ImportRowStatus)[keyof typeof ImportRowStatus];

export const ImportBatchStatus = {
  NEW: 'NEW',
  PARSING: 'PARSING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;
export type ImportBatchStatus = (typeof ImportBatchStatus)[keyof typeof ImportBatchStatus];

export const MessageStatus = {
  QUEUED: 'QUEUED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
  DEAD: 'DEAD',
  RESCHEDULED: 'RESCHEDULED',
  CANCELLED: 'CANCELLED',
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;
export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection];

export const SuppressionLevel = {
  PAUSED_UNTIL: 'PAUSED_UNTIL',
  PERMANENT: 'PERMANENT',
} as const;
export type SuppressionLevel = (typeof SuppressionLevel)[keyof typeof SuppressionLevel];

/** Источник привлечения, п. 18 ТЗ. */
export const AcquisitionSource = {
  PARSING_TELEGRAM: 'PARSING_TELEGRAM',
  TELEGRAM_ADS: 'TELEGRAM_ADS',
  VK: 'VK',
  YOUTUBE: 'YOUTUBE',
  SEO: 'SEO',
  REFERRAL: 'REFERRAL',
  CONFERENCE: 'CONFERENCE',
  OUTBOUND_SEARCH: 'OUTBOUND_SEARCH',
  OTHER: 'OTHER',
} as const;
export type AcquisitionSource = (typeof AcquisitionSource)[keyof typeof AcquisitionSource];

export const EventType = {
  IMPORT_CREATED: 'IMPORT_CREATED',
  ROW_IMPORTED: 'ROW_IMPORTED',
  DUPLICATE_FOUND: 'DUPLICATE_FOUND',
  CONTACT_CREATED: 'CONTACT_CREATED',
  CONTACT_UPDATED: 'CONTACT_UPDATED',
  DEAL_CREATED: 'DEAL_CREATED',
  MANAGER_ASSIGNED: 'MANAGER_ASSIGNED',
  MESSAGE_QUEUED: 'MESSAGE_QUEUED',
  MESSAGE_SENT: 'MESSAGE_SENT',
  MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
  MESSAGE_FAILED: 'MESSAGE_FAILED',
  MESSAGE_RESCHEDULED: 'MESSAGE_RESCHEDULED',
  MESSAGE_CANCELLED: 'MESSAGE_CANCELLED',
  REPLY_RECEIVED: 'REPLY_RECEIVED',
  AUTOMATION_STOPPED: 'AUTOMATION_STOPPED',
  QUALIFICATION_COMPLETED: 'QUALIFICATION_COMPLETED',
  DEAL_STAGE_CHANGED: 'DEAL_STAGE_CHANGED',
  MANUAL_OUTREACH_REQUIRED: 'MANUAL_OUTREACH_REQUIRED',
  PARTNER_CONNECTED: 'PARTNER_CONNECTED',
  FIRST_REFERRAL: 'FIRST_REFERRAL',
  FIRST_SALE: 'FIRST_SALE',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

/** Причины, по которым guard-цепочка не пропустила отправку (docs/06-state-machines.md). */
export const SendBlockReason = {
  AUTOMATION_NOT_ACTIVE: 'AUTOMATION_NOT_ACTIVE',
  SUPPRESSED: 'SUPPRESSED',
  ALREADY_REPLIED: 'ALREADY_REPLIED',
  ALREADY_SENT: 'ALREADY_SENT',
  NO_CHANNEL: 'NO_CHANNEL',
  CHANNEL_LIMIT_REACHED: 'CHANNEL_LIMIT_REACHED',
  MANAGER_LIMIT_REACHED: 'MANAGER_LIMIT_REACHED',
  OUTSIDE_SEND_WINDOW: 'OUTSIDE_SEND_WINDOW',
  TEMPLATE_RENDER_FAILED: 'TEMPLATE_RENDER_FAILED',
} as const;
export type SendBlockReason = (typeof SendBlockReason)[keyof typeof SendBlockReason];
