import { createContext, useContext } from 'react'

export const PageActiveContext = createContext(true)

export function usePageActive() {
  return useContext(PageActiveContext)
}
