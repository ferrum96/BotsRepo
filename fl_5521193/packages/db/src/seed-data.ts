import { eq } from 'drizzle-orm';
import {
  ChannelKind,
  DEFAULT_SCORING_THRESHOLDS,
  DEFAULT_SCORING_WEIGHTS,
  OutreachStep,
} from '@astrostone/contracts';
import type { Db } from './client';
import { channels, managers, messageTemplates, scoringConfigs, templateVersions } from './schema/index';

/**
 * Тексты касаний из п. 9 и 11 ТЗ. Финальные формулировки согласовывает заказчик
 * (docs/08-open-questions.md, вопрос 10) — здесь рабочая версия для dev и демо.
 */
const TEMPLATES: {
  code: string;
  step: string;
  body: string;
  requiredVariables: string[];
}[] = [
  {
    code: 'tg_first_touch',
    step: OutreachStep.FIRST,
    body:
      'Здравствуйте, {{firstName}}! Меня зовут {{managerName}}, AstroStone. ' +
      'Увидела, что вы практикуете ведическую астрологию. Подскажите, пожалуйста, ' +
      'используете ли вы в своей практике рекомендации по астрологическим камням?',
    requiredVariables: ['firstName', 'managerName'],
  },
  {
    code: 'tg_followup_d3',
    step: OutreachStep.FOLLOWUP_D3,
    body:
      '{{firstName}}, здравствуйте! Возможно, моё сообщение затерялось. ' +
      'Мне правда интересно узнать, работаете ли вы с камнями в консультациях.',
    requiredVariables: ['firstName'],
  },
  {
    code: 'tg_followup_d7',
    step: OutreachStep.FOLLOWUP_D7,
    body:
      '{{firstName}}, мы подготовили памятку о требованиях к астрологическим камням в Джйотиш: ' +
      'какие характеристики важны и на что смотреть при подборе. Прислать?',
    requiredVariables: ['firstName'],
  },
  {
    code: 'tg_followup_d14',
    step: OutreachStep.FOLLOWUP_D14,
    body:
      '{{firstName}}, поделюсь коротким кейсом коллеги: как рекомендации по камням ' +
      'вписались в её консультации и что из этого вышло за три месяца.',
    requiredVariables: ['firstName'],
  },
  {
    code: 'tg_followup_d30',
    step: OutreachStep.FOLLOWUP_D30,
    body:
      '{{firstName}}, больше не буду беспокоить. Если тема камней в практике станет актуальной — ' +
      'просто напишите, помогу с подбором и условиями.',
    requiredVariables: ['firstName'],
  },
];

const SEND_WINDOW = { from: '10:00', to: '19:00', weekdays: [1, 2, 3, 4, 5] };

export async function seedReferenceData(db: Db): Promise<void> {
  const existingConfig = await db
    .select({ id: scoringConfigs.id })
    .from(scoringConfigs)
    .where(eq(scoringConfigs.version, 1));

  if (existingConfig.length === 0) {
    await db.insert(scoringConfigs).values({
      version: 1,
      weights: DEFAULT_SCORING_WEIGHTS,
      thresholds: DEFAULT_SCORING_THRESHOLDS,
      isActive: true,
    });
  }

  const existingManagers = await db.select({ id: managers.id }).from(managers).limit(1);
  if (existingManagers.length === 0) {
    const inserted = await db
      .insert(managers)
      .values([
        { fullName: 'Мария Иванова', email: 'maria@astrostone.test', amocrmUserId: 1001 },
        { fullName: 'Ольга Петрова', email: 'olga@astrostone.test', amocrmUserId: 1002 },
        { fullName: 'Анна Смирнова', email: 'anna@astrostone.test', amocrmUserId: 1003 },
      ])
      .returning({ id: managers.id });

    await db.insert(channels).values(
      inserted.map((manager, i) => ({
        kind: ChannelKind.TELEGRAM,
        externalRef: `+7999000000${i + 1}`,
        canInitiate: true,
        dailyLimit: 20,
        sendWindow: SEND_WINDOW,
        managerId: manager.id,
      })),
    );
  }

  for (const template of TEMPLATES) {
    const existing = await db
      .select({ id: messageTemplates.id })
      .from(messageTemplates)
      .where(eq(messageTemplates.code, template.code));

    if (existing.length > 0) continue;

    const [created] = await db
      .insert(messageTemplates)
      .values({
        code: template.code,
        step: template.step,
        channelKind: ChannelKind.TELEGRAM,
      })
      .returning({ id: messageTemplates.id });

    if (!created) continue;

    await db.insert(templateVersions).values({
      templateId: created.id,
      version: 1,
      body: template.body,
      requiredVariables: template.requiredVariables,
      isActive: true,
    });
  }
}
