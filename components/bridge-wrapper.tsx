"use client"

import { useState, useEffect } from "react"
import Bridge from "./bridge"
import { Header } from "./layout/header"

export default function BridgeWrapper() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-lg space-y-8">
          {mounted ? (
            <Bridge />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
