import { redirect } from 'next/navigation';

interface Props {
  params: { id: string };
}

export default function CanteenDetailPage({ params }: Props) {
  redirect(`/menu/${params.id}`);
}
