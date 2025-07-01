"use client"

import { SignUp } from "@clerk/nextjs"

export default function Page() {
  return (
    <div className="min-h-screen bg-yellow-300 p-3 sm:p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl md:text-6xl font-black text-black mb-2 tracking-tight break-words">
            c0 - fileshare
          </h1>
          <div className="w-16 sm:w-24 h-1 sm:h-2 bg-black"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 items-start">
          {/* Left Column - Welcome Text */}
          <div className="space-y-4 sm:space-y-6 order-2 lg:order-1">
            <div className="bg-white border-2 sm:border-4 border-black p-4 sm:p-6 lg:p-8 shadow-[4px_4px_0px_0px_#000000] sm:shadow-[8px_8px_0px_0px_#000000]">
              <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-black mb-3 sm:mb-4 leading-tight">
                WELCOME BACK!
              </h2>
                <p className="text-sm sm:text-base lg:text-lg font-bold text-black mb-4 sm:mb-6">
                Ready to share your files? Sign in to access your dashboard and start sharing securely.
                </p>
                <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-black flex-shrink-0"></div>
                  <span className="font-bold text-black text-sm sm:text-base">Upload and share files</span>
                </div>
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-black flex-shrink-0"></div>
                  <span className="font-bold text-black text-sm sm:text-base">Manage your downloads</span>
                </div>
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="w-3 h-3 sm:w-4 sm:h-4 bg-black flex-shrink-0"></div>
                  <span className="font-bold text-black text-sm sm:text-base">Track sharing activity</span>
                </div>
              </div>
            </div>

            {/* Decorative Elements - Hidden on mobile, shown on larger screens */}
            <div className="hidden sm:block lg:block space-y-3 sm:space-y-4">
              <div className="bg-pink-400 border-2 sm:border-4 border-black p-3 sm:p-4 shadow-[3px_3px_0px_0px_#000000] sm:shadow-[6px_6px_0px_0px_#000000]">
                <div className="text-lg sm:text-xl font-black text-black">SHARE</div>
              </div>
              <div className="bg-cyan-400 border-2 sm:border-4 border-black p-3 sm:p-4 shadow-[3px_3px_0px_0px_#000000] sm:shadow-[6px_6px_0px_0px_#000000] ml-4 sm:ml-8">
                <div className="text-lg sm:text-xl font-black text-black">RECEIVE</div>
              </div>
              <div className="bg-green-400 border-2 sm:border-4 border-black p-3 sm:p-4 shadow-[3px_3px_0px_0px_#000000] sm:shadow-[6px_6px_0px_0px_#000000] ml-2 sm:ml-4">
                <div className="text-lg sm:text-xl font-black text-black">SEND</div>
              </div>
            </div>
          </div>

          {/* Right Column - Sign In Form */}
          <div className="space-y-4 sm:space-y-6 order-1 lg:order-2">
            <div className="bg-white border-2 sm:border-4 border-black p-4 sm:p-6 lg:p-8 shadow-[6px_6px_0px_0px_#000000] sm:shadow-[12px_12px_0px_0px_#000000]">
              <div className="mb-4 sm:mb-6">
                <h3 className="text-xl sm:text-2xl font-black text-black mb-2">SIGN IN</h3>
                <div className="w-12 sm:w-16 h-0.5 sm:h-1 bg-black"></div>
              </div>

              <div className="[&_.cl-rootBox]:w-full [&_.cl-card]:border-2 sm:[&_.cl-card]:border-4 [&_.cl-card]:border-black [&_.cl-card]:shadow-none [&_.cl-card]:bg-white [&_.cl-headerTitle]:font-black [&_.cl-headerTitle]:text-black [&_.cl-headerTitle]:text-lg sm:[&_.cl-headerTitle]:text-xl [&_.cl-headerSubtitle]:font-bold [&_.cl-headerSubtitle]:text-black [&_.cl-headerSubtitle]:text-sm sm:[&_.cl-headerSubtitle]:text-base [&_.cl-socialButtonsBlockButton]:border-2 sm:[&_.cl-socialButtonsBlockButton]:border-4 [&_.cl-socialButtonsBlockButton]:border-black [&_.cl-socialButtonsBlockButton]:shadow-[2px_2px_0px_0px_#000000] sm:[&_.cl-socialButtonsBlockButton]:shadow-[4px_4px_0px_0px_#000000] [&_.cl-socialButtonsBlockButton]:bg-yellow-300 [&_.cl-socialButtonsBlockButton]:font-black [&_.cl-socialButtonsBlockButton]:text-sm sm:[&_.cl-socialButtonsBlockButton]:text-base [&_.cl-formFieldInput]:border-2 sm:[&_.cl-formFieldInput]:border-4 [&_.cl-formFieldInput]:border-black [&_.cl-formFieldInput]:bg-white [&_.cl-formFieldInput]:font-bold [&_.cl-formFieldInput]:text-sm sm:[&_.cl-formFieldInput]:text-base [&_.cl-formButtonPrimary]:bg-black [&_.cl-formButtonPrimary]:border-2 sm:[&_.cl-formButtonPrimary]:border-4 [&_.cl-formButtonPrimary]:border-black [&_.cl-formButtonPrimary]:shadow-[2px_2px_0px_0px_#666666] sm:[&_.cl-formButtonPrimary]:shadow-[4px_4px_0px_0px_#666666] [&_.cl-formButtonPrimary]:font-black [&_.cl-formButtonPrimary]:text-white [&_.cl-formButtonPrimary]:text-sm sm:[&_.cl-formButtonPrimary]:text-base [&_.cl-footerActionLink]:font-black [&_.cl-footerActionLink]:text-black [&_.cl-footerActionLink]:text-sm sm:[&_.cl-footerActionLink]:text-base [&_.cl-footerActionText]:font-bold [&_.cl-footerActionText]:text-black [&_.cl-footerActionText]:text-sm sm:[&_.cl-footerActionText]:text-base">
                <SignUp
                  appearance={{
                    elements: {
                      card: "border-2 sm:border-4 border-black shadow-none bg-white",
                      headerTitle: "font-black text-black text-lg sm:text-xl",
                      headerSubtitle: "font-bold text-black text-sm sm:text-base",
                      socialButtonsBlockButton:
                        "border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_#000000] sm:shadow-[4px_4px_0px_0px_#000000] bg-yellow-300 font-black hover:bg-pink-400 text-sm sm:text-base",
                      formFieldInput:
                        "border-2 sm:border-4 border-black bg-white font-bold focus:border-black text-sm sm:text-base",
                      formButtonPrimary:
                        "bg-black border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_#666666] sm:shadow-[4px_4px_0px_0px_#666666] font-black text-white hover:bg-gray-800 text-sm sm:text-base",
                      footerActionLink: "font-black text-black hover:text-pink-600 text-sm sm:text-base",
                      footerActionText: "font-bold text-black text-sm sm:text-base",
                      dividerLine: "bg-black h-0.5 sm:h-1",
                      dividerText: "font-black text-black bg-white px-2 sm:px-4 text-sm sm:text-base",
                    },
                  }}
                />
              </div>
            </div>

            {/* Bottom Decorative Box */}
            <div className="bg-pink-400 border-2 sm:border-4 border-black p-4 sm:p-6 shadow-[4px_4px_0px_0px_#000000] sm:shadow-[8px_8px_0px_0px_#000000]">
              <div className="text-center">
                <div className="text-base sm:text-lg font-black text-black mb-1 sm:mb-2">NEW TO c0?</div>
                <div className="text-xs sm:text-sm font-bold text-black">
                  Join thousands of users already using our platform!
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Decorative Elements - Mobile optimized */}
        <div className="mt-8 sm:mt-12 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <div className="bg-cyan-400 border-2 sm:border-4 border-black p-2 sm:p-4 shadow-[2px_2px_0px_0px_#000000] sm:shadow-[4px_4px_0px_0px_#000000] text-center">
            <div className="text-lg sm:text-2xl font-black text-black">1K+</div>
            <div className="text-xs sm:text-sm font-bold text-black">USERS</div>
          </div>
          <div className="bg-green-400 border-2 sm:border-4 border-black p-2 sm:p-4 shadow-[2px_2px_0px_0px_#000000] sm:shadow-[4px_4px_0px_0px_#000000] text-center">
            <div className="text-lg sm:text-2xl font-black text-black">1+GB</div>
            <div className="text-xs sm:text-sm font-bold text-black">FILES</div>
          </div>
          <div className="bg-pink-400 border-2 sm:border-4 border-black p-2 sm:p-4 shadow-[2px_2px_0px_0px_#000000] sm:shadow-[4px_4px_0px_0px_#000000] text-center">
            <div className="text-lg sm:text-2xl font-black text-black">24/7</div>
            <div className="text-xs sm:text-sm font-bold text-black">SUPPORT</div>
          </div>
          <div className="bg-yellow-300 border-2 sm:border-4 border-black p-2 sm:p-4 shadow-[2px_2px_0px_0px_#000000] sm:shadow-[4px_4px_0px_0px_#000000] text-center">
            <div className="text-lg sm:text-2xl font-black text-black">100%</div>
            <div className="text-xs sm:text-sm font-bold text-black">SECURE</div>
          </div>
        </div>

        {/* Mobile-only decorative elements */}
        <div className="block sm:hidden mt-6 space-y-3">
          <div className="flex space-x-2">
            <div className="bg-pink-400 border-2 border-black p-2 shadow-[2px_2px_0px_0px_#000000] flex-1 text-center">
              <div className="text-sm font-black text-black">SHARE</div>
            </div>
            <div className="bg-cyan-400 border-2 border-black p-2 shadow-[2px_2px_0px_0px_#000000] flex-1 text-center">
              <div className="text-sm font-black text-black">RECEIVE</div>
            </div>
            <div className="bg-green-400 border-2 border-black p-2 shadow-[2px_2px_0px_0px_#000000] flex-1 text-center">
              <div className="text-sm font-black text-black">SEND</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
