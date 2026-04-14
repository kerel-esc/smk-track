import React, { createContext, useContext, useState } from 'react'
import { en } from './i18n/en'
import { pl } from './i18n/pl'

const LanguageContext = createContext()

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState('en')

  const t = (key) => {
    if (lang === 'en') {
      return en[key] || key
    }
    return pl[key] || en[key] || key
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }

  return context
}