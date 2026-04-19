const path = require("path");

module.exports = (env, argv) => {
    const isProd = (argv && argv.mode) === "production";
    return {
        mode: isProd ? "production" : "development",
        entry: "./src/index.js",
        devtool: false,
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "sonarr-naming.js",
            iife: true,
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: "babel-loader",
                },
                {
                    test: /\.s[ac]ss$/i,
                    use: [
                        "style-loader",
                        "css-loader",
                        {
                            loader: "sass-loader",
                            options: { api: "modern" },
                        },
                    ],
                },
                {
                    test: /\.css$/i,
                    use: ["style-loader", "css-loader"],
                },
            ],
        },
        optimization: {
            minimize: isProd,  // minify only in production
        },
    };
};
