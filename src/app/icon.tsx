import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background:
            "linear-gradient(160deg, #165dff 0%, #0f4bd6 45%, #e8f0ff 45%, #f4f7fb 100%)",
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            width: 264,
            height: 264,
            borderRadius: 72,
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 28px 60px rgba(12, 46, 130, 0.22)",
          }}
        >
          <div
            style={{
              width: 150,
              height: 150,
              borderRadius: 999,
              border: "12px solid #165dff",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                background: "#165dff",
                position: "absolute",
                top: 34,
              }}
            />
            <div
              style={{
                width: 74,
                height: 46,
                borderRadius: "46px 46px 34px 34px",
                border: "12px solid #165dff",
                borderTop: "0",
                position: "absolute",
                bottom: 26,
              }}
            />
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 46,
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: "#12317d",
          }}
        >
          Grab Ticket
        </div>
      </div>
    ),
    size,
  );
}
