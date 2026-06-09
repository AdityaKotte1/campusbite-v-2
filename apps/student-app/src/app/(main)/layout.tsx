import { Header } from '@/components/layout/header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { CartSheet } from '@/components/cart/cart-sheet';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Header />
      <main className="flex-1 pb-safe">
        {children}
      </main>
      <BottomNav />
      <CartSheet />
    </div>
  );
}
