import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-yellow-300 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8 md:mb-12">
          <h1 className="text-4xl md:text-6xl font-black text-black mb-4 transform -rotate-1"><span className="text-blue-500">c0</span> FILE SHARE</h1>
          <p className="text-lg md:text-xl font-bold text-black bg-white p-3 md:p-4 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transform rotate-1 mx-2">
            SECURE • DIRECT • NO SERVERS
          </p>
        </header>

        <SignedOut>
          <Card className="border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] bg-white">
            <CardHeader>
              <CardTitle className="text-3xl font-black text-center">GET STARTED</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-lg font-bold mb-6">Sign in to start sharing files directly between browsers!</p>
              <SignInButton>
                <Button className="bg-red-500 hover:bg-red-600 text-white font-black text-lg md:text-xl px-6 md:px-8 py-3 md:py-4 border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transform hover:translate-x-1 hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all touch-target">
                    SIGN IN NOW
                  </Button>
              </SignInButton>
            </CardContent>
          </Card>
        </SignedOut>

        <SignedIn>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <Card className="border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] bg-green-400">
              <CardHeader>
                <CardTitle className="text-2xl font-black">CREATE SESSION</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-bold mb-4">Start a new file sharing session</p>
                <Link href="/dashboard/create">
                  <Button className="w-full bg-black text-white hover:bg-white hover:text-green-400 font-black text-lg py-3 border-4 border-black shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:translate-x-1 hover:translate-y-1 transition-all">
                    CREATE NOW
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-4 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] bg-blue-400">
              <CardHeader>
                <CardTitle className="text-2xl font-black">JOIN SESSION</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-bold mb-4">Join an existing session with a code</p>
                <Link href="/dashboard/join">
                  <Button className="w-full bg-black text-white hover:bg-white hover:text-blue-400 font-black text-lg py-3 border-4 border-black shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:translate-x-1 hover:translate-y-1 transition-all">
                    JOIN NOW
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 md:mt-12 text-center">
            <Card className="border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-purple-300">
              <CardContent className="p-4 md:p-6">
                <h3 className="text-xl md:text-2xl font-black mb-4">HOW IT WORKS</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                  <div className="bg-white p-3 md:p-4 border-2 border-black">
                    <h4 className="font-black text-base md:text-lg">1. CREATE</h4>
                    <p className="font-bold text-sm md:text-base">Generate a 6-digit code</p>
                  </div>
                  <div className="bg-white p-3 md:p-4 border-2 border-black">
                    <h4 className="font-black text-base md:text-lg">2. SHARE</h4>
                    <p className="font-bold text-sm md:text-base">Send code or QR to friend</p>
                  </div>
                  <div className="bg-white p-3 md:p-4 border-2 border-black">
                    <h4 className="font-black text-base md:text-lg">3. TRANSFER</h4>
                    <p className="font-bold text-sm md:text-base">Files go direct browser-to-browser</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </SignedIn>
      </div>
      
      <SignedIn>
        <div className="fixed bottom-4 right-4 p-2 bg-white border-4 border-black rounded-full shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all">
          <UserButton
        appearance={{
          elements: {
            avatarBox: "h-12 w-12 border-2 border-black rounded-full",
            userButtonBox: "border-2 border-black rounded-full p-1",
          },
        }}
          />
        </div>
      </SignedIn>
    </div>
  )
}
