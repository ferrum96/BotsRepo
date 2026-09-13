import { AcquisitionStage } from '@astrostone/contracts';

export const ASTRO_PIPELINE_NAME = 'Астро-партнёры';

export interface PipelineStageSpec {
  stage: AcquisitionStage;
  name: string;
  color: string;
  sort: number;
}

/** Этапы п. 5 ТЗ. Цвета — из палитры amoCRM. */
export const ASTRO_PIPELINE_STAGES: PipelineStageSpec[] = [
  { stage: AcquisitionStage.NEW_PROSPECT, name: 'Новый потенциальный партнёр', color: '#c1e0ff', sort: 10 },
  { stage: AcquisitionStage.FIRST_TOUCH_SENT, name: 'Первое касание отправлено', color: '#98cbff', sort: 20 },
  { stage: AcquisitionStage.NURTURING, name: 'Нет ответа / прогрев', color: '#fffeb2', sort: 30 },
  { stage: AcquisitionStage.REPLIED, name: 'Ответил', color: '#deff81', sort: 40 },
  { stage: AcquisitionStage.QUALIFIED, name: 'Квалифицирован', color: '#87f2c0', sort: 50 },
  { stage: AcquisitionStage.INTERESTED, name: 'Интерес к партнёрству', color: '#ebffb1', sort: 60 },
  { stage: AcquisitionStage.CALL_SCHEDULED, name: 'Созвон / презентация', color: '#ffeab2', sort: 70 },
  { stage: AcquisitionStage.THINKING, name: 'Думает', color: '#ffdc7f', sort: 80 },
  { stage: AcquisitionStage.PARTNER_CONNECTED, name: 'Подключён как партнёр', color: '#f3beff', sort: 90 },
  { stage: AcquisitionStage.PARTNER_ACTIVE, name: 'Активный партнёр', color: '#87f2c0', sort: 100 },
  { stage: AcquisitionStage.CLOSED_NOT_TARGET, name: 'Не целевой', color: '#e6e8ea', sort: 110 },
  { stage: AcquisitionStage.CLOSED_REFUSED, name: 'Отказ', color: '#ff8f92', sort: 120 },
  { stage: AcquisitionStage.CLOSED_NO_CONTACT, name: 'Нет связи', color: '#ffc8c8', sort: 130 },
  { stage: AcquisitionStage.CLOSED_NO_STONES, name: 'Не занимается подбором камней', color: '#ffdbdb', sort: 140 },
];

export interface AstroPipelineMap {
  pipelineId: number;
  statusId: number;
  statusByStage: Partial<Record<AcquisitionStage, number>>;
}

export interface PipelineCatalog {
  id: number;
  name: string;
  statuses: Array<{ id: number; name: string }>;
}

export type PipelineStatusInput = { name: string; sort: number; color: string };

export interface PipelineAdmin {
  pipelines(): Promise<PipelineCatalog[]>;
  createPipeline(name: string, statuses?: PipelineStatusInput[]): Promise<{ id: number }>;
  createStatuses(pipelineId: number, statuses: PipelineStatusInput[]): Promise<Array<{ id: number; name: string }>>;
}

const byName = (name: string) => (status: { name: string }) => status.name === name;

/**
 * Идемпотентно поднимает воронку п. 5: нет — создаём, статусы дописываем по имени.
 */
export async function ensureAstroPipeline(admin: PipelineAdmin): Promise<AstroPipelineMap> {
  const specs = ASTRO_PIPELINE_STAGES.map((spec) => ({
    name: spec.name,
    sort: spec.sort,
    color: spec.color,
  }));

  let catalog = (await admin.pipelines()).find((pipeline) => pipeline.name === ASTRO_PIPELINE_NAME);
  if (!catalog) {
    const created = await admin.createPipeline(ASTRO_PIPELINE_NAME, specs);
    catalog = (await admin.pipelines()).find((pipeline) => pipeline.id === created.id);
    if (!catalog) throw new Error('воронка «Астро-партнёры»: создана, но не читается');
  }

  const missing = ASTRO_PIPELINE_STAGES.filter((spec) => !catalog.statuses.some(byName(spec.name)));
  const createdStatuses =
    missing.length > 0
      ? await admin.createStatuses(
          catalog.id,
          missing.map((spec) => ({ name: spec.name, sort: spec.sort, color: spec.color })),
        )
      : [];

  const pipelineId = catalog.id;
  const statuses = [...catalog.statuses, ...createdStatuses];
  const statusByStage: Partial<Record<AcquisitionStage, number>> = {};
  for (const spec of ASTRO_PIPELINE_STAGES) {
    const found = statuses.find(byName(spec.name));
    if (found) statusByStage[spec.stage] = found.id;
  }

  const statusId = statusByStage[AcquisitionStage.NEW_PROSPECT];
  if (!statusId) throw new Error('воронка «Астро-партнёры»: нет статуса «Новый потенциальный партнёр»');

  return { pipelineId, statusId, statusByStage };
}
