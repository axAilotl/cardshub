'use client';

interface UploaderInfoProps {
  uploader: {
    username: string;
    displayName: string | null;
  };
  createdAt: number;
}

export function UploaderInfo({ uploader, createdAt }: UploaderInfoProps) {
  const displayName = uploader.displayName || uploader.username;

  return (
    <div className="flex items-center gap-3 mt-4 text-sm text-starlight/60">
      <div className="w-8 h-8 rounded-full bg-nebula/20 flex items-center justify-center">
        <span className="text-sm">{displayName[0].toUpperCase()}</span>
      </div>
      <div>
        Uploaded by <span className="text-nebula">{displayName}</span>
        {' '}on {new Date(createdAt * 1000).toLocaleDateString()}
      </div>
    </div>
  );
}
