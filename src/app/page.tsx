export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-black">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold text-blue-600 mb-4">
          TapBumber
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Earn money by tapping and completing tasks on Telegram
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">Welcome Boss 👋</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Your clean TapBumber project is ready.
            <br />
            Connect your Supabase and Telegram bot next.
          </p>
        </div>

        <a
          href="https://t.me/your_bot_username"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-8 rounded-full transition"
        >
          Open Telegram Bot
        </a>
      </div>
    </main>
  );
}