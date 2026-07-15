import { FormEvent, useEffect, useState } from 'react'

import type { Member, MemberUpdate } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'

interface EditMemberModalProps {
  open: boolean
  member: Member | null
  isSaving?: boolean
  onCancel: () => void
  onSave: (payload: MemberUpdate) => void
}

export function EditMemberModal({
  open,
  member,
  isSaving = false,
  onCancel,
  onSave,
}: EditMemberModalProps) {
  const [gameNick, setGameNick] = useState('')
  const [realName, setRealName] = useState('')
  const [discordNick, setDiscordNick] = useState('')
  const [perspective, setPerspective] = useState('FPP')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!member) return
    setGameNick(member.game_nick)
    setRealName(member.real_name)
    setDiscordNick(member.discord_nick || '')
    setPerspective(member.perspective)
    setError('')
  }, [member])

  if (!open || !member) return null

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nick = gameNick.trim()
    const name = realName.trim()
    if (!nick || !name) {
      setError('Ник и имя обязательны')
      return
    }
    onSave({
      game_nick: nick,
      real_name: name,
      discord_nick: discordNick.trim() || null,
      perspective,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 px-0 sm:px-4 py-0 sm:py-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-lg border border-outline-level bg-surface-1 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_12px_48px_rgba(0,0,0,0.4)]"
      >
        <h3 className="text-on-surface text-lg font-semibold">Редактировать участника</h3>
        <p className="mt-1 text-on-surface-variant text-body-sm">
          Изменение ника обновит member tag в Telegram
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] text-on-surface-variant">Имя</span>
            <Input
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              disabled={isSaving}
              maxLength={64}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-on-surface-variant">Ник в игре</span>
            <Input
              value={gameNick}
              onChange={(e) => setGameNick(e.target.value)}
              disabled={isSaving}
              maxLength={64}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-on-surface-variant">Ник в Discord</span>
            <Input
              value={discordNick}
              onChange={(e) => setDiscordNick(e.target.value)}
              disabled={isSaving}
              maxLength={64}
              placeholder="необязательно"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-on-surface-variant">Режим</span>
            <Select
              value={perspective}
              onChange={(e) => setPerspective(e.target.value)}
              disabled={isSaving}
            >
              <option value="FPP">FPP</option>
              <option value="TPP">TPP</option>
              <option value="Mixed">Mixed</option>
            </Select>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            className="w-full sm:w-auto min-h-10 px-4 py-2"
            onClick={onCancel}
            disabled={isSaving}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            className="w-full sm:w-auto min-h-10 px-4 py-2"
            disabled={isSaving}
          >
            {isSaving ? 'Сохраняю…' : 'Сохранить'}
          </Button>
        </div>
      </form>
    </div>
  )
}
