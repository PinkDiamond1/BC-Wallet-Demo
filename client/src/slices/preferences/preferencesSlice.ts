import type { PayloadAction } from '@reduxjs/toolkit'

import { createSlice } from '@reduxjs/toolkit'

import { fetchLastServerReset } from './preferencesThunks'

interface PreferencesState {
  darkMode: boolean
  completedUseCaseSlugs: string[]
  demoCompleted: boolean
  completeCanceled: boolean
  connectionDate?: Date
  lastServerReset?: Date
}

const initialState: PreferencesState = {
  darkMode: false,
  completedUseCaseSlugs: [],
  demoCompleted: false,
  completeCanceled: false,
  connectionDate: undefined,
  lastServerReset: undefined,
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    setDarkMode: (state, action) => {
      localStorage.setItem('theme', action.payload ? 'dark' : 'light')

      if (action.payload) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }

      state.darkMode = action.payload ?? !state.darkMode
    },
    setConnectionDate: (state, action) => {
      state.connectionDate = action.payload
    },
    useCaseCompleted: (state, action: PayloadAction<string>) => {
      if (!state.completedUseCaseSlugs.includes(action.payload)) {
        state.completedUseCaseSlugs.push(action.payload)
      }
      state.completeCanceled = false
    },
    setDemoCompleted: (state, val) => {
      state.demoCompleted = val.payload
    },
    resetDashboard: (state) => {
      state.completedUseCaseSlugs = []
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase('demo/RESET', (state) => {
        state.darkMode = localStorage.getItem('theme') === 'dark'
        state.connectionDate = undefined
      })
      .addCase(fetchLastServerReset.fulfilled, (state, action) => {
        state.lastServerReset = action.payload
      })
  },
})

export const { setDarkMode, useCaseCompleted, resetDashboard, setDemoCompleted, setConnectionDate } =
  preferencesSlice.actions

export default preferencesSlice.reducer
