import Navbar from "./Navbar";
import Footer from "./Footer";

export default function MainComponent({ children }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
