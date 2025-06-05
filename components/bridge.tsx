"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import dynamic from "next/dynamic"

// Dynamically import the bridge content with no SSR
const BridgeContent = dynamic(() => import("./bridge-content"), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <div className="text-center py-8 text-muted-foreground">
        <p>Loading bridge interface...</p>
      </div>
    </div>
  ),
})

export default function Bridge() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <Card className="border-0 shadow-xl bg-card/50 backdrop-blur">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Bridge Assets</CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        {mounted ? (
          <BridgeContent />
        ) : (
          <div className="space-y-6">
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading bridge interface...</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
