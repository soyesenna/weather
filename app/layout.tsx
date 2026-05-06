import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '서울 도시침수 대응 데모',
  description: '공공 API와 룰베이스 위험도 산정 기반 서울 도시침수 대응 데모 웹',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
