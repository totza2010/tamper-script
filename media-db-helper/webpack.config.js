const path = require('path');

module.exports = (env, argv) => {
    const isProd = (argv && argv.mode) === 'production';
    return {
        mode: isProd ? 'production' : 'development',
        entry: './src/index.js',
        devtool: false,
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'media-db-helper.js',
            iife: true,
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: 'babel-loader',
                },
                {
                    test: /\.s[ac]ss$/i,
                    use: [
                        'style-loader',
                        'css-loader',
                        { loader: 'sass-loader', options: { api: 'modern' } },
                    ],
                },
                {
                    test: /\.css$/i,
                    use: ['style-loader', 'css-loader'],
                },
            ],
        },
        optimization: {
            minimize: isProd,
        },
        // GM_* are injected as globals by Tampermonkey — don't bundle them
        externals: {
            GM_setValue:      'GM_setValue',
            GM_getValue:      'GM_getValue',
            GM_xmlhttpRequest:'GM_xmlhttpRequest',
            unsafeWindow:     'unsafeWindow',
        },
    };
};
