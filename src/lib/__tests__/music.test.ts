import { describe, expect, it } from "vitest";
import { findSongLink } from "../music";

describe("findSongLink", () => {
  it("finds a Spotify song link in shared text", () => {
    expect(findSongLink("Listen to this! https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123")).toBe("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc123");
    expect(findSongLink("https://open.spotify.com/intl-sv/track/4uLU6hMCjMI75M1A2tKUQC")).toBe("https://open.spotify.com/intl-sv/track/4uLU6hMCjMI75M1A2tKUQC");
    expect(findSongLink("https://spotify.link/AbC123 shared")).toBe("https://spotify.link/AbC123");
  });
  it("ignores other links", () => {
    expect(findSongLink("https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
    expect(findSongLink("https://youtube.com/watch?v=x")).toBeNull();
    expect(findSongLink(null)).toBeNull();
  });
});
