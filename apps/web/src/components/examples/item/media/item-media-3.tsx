import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item"

const music = [
  {
    title: "Midnight City Lights",
    artist: "Neon Dreams",
    album: "Electric Nights",
    duration: "3:45",
  },
  {
    title: "Coffee Shop Conversations",
    artist: "The Morning Brew",
    album: "Urban Stories",
    duration: "4:05",
  },
  {
    title: "Digital Rain",
    artist: "Cyber Symphony",
    album: "Binary Beats",
    duration: "3:30",
  },
]

const Example = () => (
  <div className="flex w-full max-w-md flex-col gap-6">
    <ItemGroup className="gap-4">
      {music.map(song => (
        <Item className="bg-background" key={song.title} variant="outline" render={<a href="#" />}><ItemMedia variant="image">
                        <img
                          alt={song.title}
                          className="object-cover grayscale"
                          height={32}
                          src="https://placehold.co/32x32"
                          width={32}
                        />
                      </ItemMedia><ItemContent>
                        <ItemTitle className="line-clamp-1">
                          {song.title} - <span className="text-muted-foreground">{song.album}</span>
                        </ItemTitle>
                        <ItemDescription>{song.artist}</ItemDescription>
                      </ItemContent><ItemContent className="flex-none text-center">
                        <ItemDescription>{song.duration}</ItemDescription>
                      </ItemContent></Item>
      ))}
    </ItemGroup>
  </div>
)

export default Example
