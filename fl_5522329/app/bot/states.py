from aiogram.fsm.state import State, StatesGroup


class ProfileForm(StatesGroup):
    birth_date = State()
    birth_time = State()
    birth_place = State()
    confirm_place = State()
