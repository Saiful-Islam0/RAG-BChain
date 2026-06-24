import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./components/Home";
import FactCheck from "./components/FactCheck";
import Methodology from "./components/Methodology";
import Tools from "./components/Tools";
import AIDetect from "./components/AIDetect";
import ClaimDetail from "./components/ClaimDetail";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/fact-check" element={<FactCheck />} />
        <Route path="/howitworks" element={<Methodology />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/detect" element={<AIDetect />} />
        <Route path="/claim/:id" element={<ClaimDetail />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
